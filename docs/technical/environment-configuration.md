# Environment and Configuration

The project structure is fairly straightforward once the client and server are
looked at separately, however, there is another part sitting between the code and
the environment where the game is actually running.

That part is configuration.

The main reason configuration exists is that the same code needs to work in more
than one place. During development the client and server normally talk to each
other through `localhost`, while the production version needs to use the address
of the live server instead.

It would technically be possible to write those addresses directly into the
JavaScript files and change them by hand whenever the environment changes.
However, doing that would make it very easy to accidentally commit a development
address into production, or the other way around.

Instead, Madiao uses environment variables to provide the small amount of
information which changes depending on where the game is running.

There are currently two especially important values: `REACT_APP_SERVER_URL`
and `CLIENT_ORIGIN`.

They sound fairly similar, however, they are used on opposite sides of the
application and solve two different problems.


## The Current Configuration Setup

The project uses slightly different configuration paths depending on whether the
game is running in development or through Docker.

The important pieces are:

```text
.env
.env.example

client/.env.development
client/src/socket.js

server/index.js

compose.yaml
```

During local development, the React client can use
`client/.env.development` because it is started directly through the React
development environment.

The production Docker setup works slightly differently.

The root `.env` file provides the values which Docker Compose needs, while
`.env.example` shows the expected variables without containing the actual
production configuration.

At a simplified level the relationship looks like this:

```mermaid
flowchart TD
    Config["Environment-specific configuration"]

    Config --> Dev["client/.env.development"]
    Dev --> DevVar["REACT_APP_SERVER_URL<br/>Development value"]

    Config --> RootEnv["Root .env"]
    RootEnv --> Compose["compose.yaml"]

    DevVar --> Socket["client/src/socket.js"]

    Compose --> ClientArg["REACT_APP_SERVER_URL<br/>Client build argument"]
    ClientArg --> Socket

    Compose --> ServerVar["CLIENT_ORIGIN<br/>Server runtime variable"]
    ServerVar --> Server["server/index.js"]
    Server --> Cors["Socket.IO CORS configuration"]
```

The client therefore needs to know **where it should connect**, while the server
needs to know **which client address it should allow to connect**.

Both are required for the production client and server to communicate properly.

The documentation service does not need either of these values because it only
serves the static MkDocs site.


## `REACT_APP_SERVER_URL`

The client creates its Socket.IO connection in:

```text
client/src/socket.js
```

The important part is:

```js title="client/src/socket.js"
const socket = io(
    process.env.REACT_APP_SERVER_URL
);
```

`REACT_APP_SERVER_URL` is therefore the address the browser will use when it
tries to connect to the Node.js game server.

The project uses a development value when the client is started locally and a
production value when the Docker image is built.


### Development

The development environment uses:

```text
client/.env.development
```

with:

```env title="client/.env.development"
REACT_APP_SERVER_URL=http://localhost:3001
```

This makes sense when both sides of the game are running on the same development
computer.

The React application can simply connect back to `localhost:3001` because the
Node server is running on that same machine.


### Production

The production Docker build receives its server address through the root:

```text
.env
```

The root file contains the values used by Docker Compose, including:

```env
REACT_APP_SERVER_URL=http://<server-address>:3001
CLIENT_ORIGIN=http://<server-address>:3000
```

Docker Compose then passes `REACT_APP_SERVER_URL` into the client image as a
build argument.

The browser ultimately needs to be able to reach whatever address is placed
into `REACT_APP_SERVER_URL`.

!!! warning "Do not use localhost in the public production client"
    Using `http://localhost:3001` in the production build would not mean
    **the production server**. It would mean port `3001` on the computer of
    whichever player opened the game.

That is one of those mistakes that can look perfectly reasonable at first,
because `localhost` works during development, however, once the game is opened
from another computer it would obviously be pointing at the wrong machine.


## Why the Client Variable Is a Build-Time Setting

One slightly unusual part of the React setup is that
`REACT_APP_SERVER_URL` is effectively decided when the client is built.

Docker Compose reads the value from the root `.env` file and supplies it to the
client build:

```yaml title="compose.yaml"
client:
  build:
    context: ./client
    args:
      REACT_APP_SERVER_URL: ${REACT_APP_SERVER_URL}
```

The client Dockerfile then accepts that value:

```dockerfile title="client/Dockerfile"
ARG REACT_APP_SERVER_URL
ENV REACT_APP_SERVER_URL=$REACT_APP_SERVER_URL
```

before building the React application:

```dockerfile title="client/Dockerfile"
RUN npm run build
```

Afterwards the build output is copied into nginx:

```dockerfile title="client/Dockerfile"
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
```

At that point nginx is only serving already-built static files.

It is no longer running the React build process.

This means that changing `REACT_APP_SERVER_URL` in the root `.env` file does
not magically change a client image which has already been built.

The client needs to be rebuilt before the new value becomes part of the
application.

In practical terms:

```mermaid
flowchart TD
    Change["Change REACT_APP_SERVER_URL<br/>in root .env"]
    Build["Rebuild the client image"]
    Replace["Replace or start madiao-client"]
    Browser["Browser receives JavaScript containing the new value"]

    Change --> Build --> Replace --> Browser
```

!!! note "Restarting nginx is not enough"
    nginx only serves the static React files which were already built. If the
    client was built with the wrong server address, the client image needs to be
    rebuilt before that value can change.


## `CLIENT_ORIGIN`

The opposite side of the connection is handled by the server.

Inside:

```text
server/index.js
```

the server reads:

```js title="server/index.js"
const CLIENT_ORIGIN =
    process.env.CLIENT_ORIGIN ||
    'http://localhost:3000';
```

The value is then used when Socket.IO is created:

```js title="server/index.js"
const io = new Server(server, {
    cors: {
        origin: CLIENT_ORIGIN,
        methods: ['GET', 'POST']
    }
});
```

The purpose of this setting is to tell the server which browser origin should be
allowed to connect.

During local development, if no value is provided, the fallback is
`http://localhost:3000`, which matches the normal React development server.

In production, Docker Compose reads the value from the root `.env` file and
supplies it to the server container through:

```yaml title="compose.yaml"
environment:
  CLIENT_ORIGIN: ${CLIENT_ORIGIN}
```

This value is read when the Node process starts.

That makes `CLIENT_ORIGIN` different from the React variable covered above.

The client value is part of the build.

The server value is provided when the container runs.


## Build-Time vs Runtime Configuration

This difference is probably the most important thing to remember from this
chapter.

Both variables are environment settings, but they are not applied at the same
time.

| Variable | Used by | Applied when | Main purpose |
| --- | --- | --- | --- |
| `REACT_APP_SERVER_URL` | React client | Client build | Tells the browser where the game server is |
| `CLIENT_ORIGIN` | Node server | Server runtime | Tells Socket.IO which client origin to allow |

A simple way of remembering it is:

| Variable | Question to remember |
| --- | --- |
| `REACT_APP_SERVER_URL` | **Where is the browser connecting to?** |
| `CLIENT_ORIGIN` | **Which browser origin is the server allowing from?** |

This distinction also changes how a configuration problem should be fixed.

If `CLIENT_ORIGIN` is wrong, changing the value and recreating or restarting the
server container is enough because Node reads it when the server starts.

If `REACT_APP_SERVER_URL` is wrong, the React client needs to be rebuilt because
the value is already inside the production JavaScript files.


## Docker Compose Configuration

The production services are tied together through:

```text
compose.yaml
```

The structure is roughly:

```yaml title="compose.yaml"
services:

  server:
    build:
      context: ./server

    container_name: madiao-server

    ports:
      - "3001:3001"

    environment:
      CLIENT_ORIGIN: ${CLIENT_ORIGIN}

    restart: unless-stopped


  client:
    build:
      context: ./client
      args:
        REACT_APP_SERVER_URL: ${REACT_APP_SERVER_URL}

    container_name: madiao-client

    ports:
      - "3000:80"

    restart: unless-stopped


  docs:
    build:
      context: .

    container_name: madiao-docs

    ports:
      - "3002:80"

    restart: unless-stopped
```

There are a few useful things to take from this.

Firstly, the client and server are built from separate folders because each has
its own application Dockerfile and build context.

The documentation build is slightly different.

Its build context is the project root because the documentation Dockerfile needs
access to both:

```text
mkdocs.yaml
docs/
```

The root Dockerfile first uses MkDocs to generate the static documentation site
and then copies the result into an nginx image.

Secondly, the port mappings explain how each service is reached in the base
production deployment:

| Host port | Container port | Service |
| ---: | ---: | --- |
| `3000` | `80` | `madiao-client` / nginx |
| `3001` | `3001` | `madiao-server` / Node.js |
| `3002` | `80` | `madiao-docs` / nginx |

Thirdly, the two application-specific environment values enter the Docker setup
in different ways.

`CLIENT_ORIGIN` is passed into the running server container.

`REACT_APP_SERVER_URL` is passed into the client image while that image is being
built.

The documentation service does not require either value.

Both production values are read by Docker Compose from the root `.env` file.

The repository also contains:

```text
.env.example
```

which records which variables are expected without storing the live production
values.


## Checking the Final Docker Configuration

Docker Compose has a very useful command for checking what it thinks the final
configuration looks like:

```bash
docker compose config
```

This does not start the game.

It simply reads the Compose file, validates it and prints the resolved
configuration.

That makes it a fairly safe command to run whenever the Docker setup has been
edited.

It is especially useful for checking:

- port mappings;
- build contexts;
- container names;
- environment values;
- YAML structure.

With the documentation service included, the resolved configuration should also
show the `docs` service and its `3002:80` mapping.

For example, if the server is rejecting the browser and there is a suspicion
that `CLIENT_ORIGIN` is wrong, checking:

```bash
docker compose config
```

is much quicker than immediately rebuilding the entire application.

If Compose itself cannot understand the YAML, it will normally report that here
before any containers are touched.


## Development and Production Environments

The project currently has a fairly simple distinction between development and
production.

| Environment | React client | Node server |
| --- | --- | --- |
| Development | `http://localhost:3000` | `http://localhost:3001` |
| Production | Live client address | Live server address |

During development the client uses:

```env
REACT_APP_SERVER_URL=http://localhost:3001
```

and the server can use its built-in fallback:

```js
'http://localhost:3000'
```

During production, the same application code is used but the addresses are
provided through the root `.env` file and Docker Compose.

This is the main reason environment configuration exists in Madiao.

The game logic itself should not need to know whether it is being played on a
development computer or on the live server.

Only the small amount of information describing how the two sides find each
other needs to change.

The documentation container does not take part in this client/server
configuration because the generated MkDocs site does not need to communicate
with the game server.


## Environment Files and Git

Environment files deserve a little bit of extra attention because the word
"environment" often gets associated with secrets.

That is not automatically the case.

The repository includes:

```text
.env.example
```

so that the expected variable names are visible without committing the live
`.env` file itself.

The actual root:

```text
.env
```

is ignored by Git.

For example, `REACT_APP_SERVER_URL` cannot really be treated as a secret
because the value is eventually delivered to every player's browser as part of
the React application.

Anybody using the website can ultimately discover which server the browser is
connecting to.

The same is true for a public-facing client address used by `CLIENT_ORIGIN`.

However, this does not mean every environment variable is safe to commit.

If the project later gains things such as database passwords, API secrets,
private tokens or session secrets, those should not be placed into a client-side
`REACT_APP_*` variable or committed into the repository.

!!! warning "Treat every REACT_APP_* value as public"
    Create React App places these values into browser-delivered JavaScript during
    the build. Environment-variable syntax makes configuration easier, but it
    does not hide the value from the player.

The wider repository rules for environment files and credentials are covered in
[Security and Repository Notes](security.md#environment-files).


## Changing the Production Address

If the production address changes in the future, the two application values are
kept in the root:

```text
.env
```

For example:

```env title=".env"
REACT_APP_SERVER_URL=http://<new-server-address>:3001
CLIENT_ORIGIN=http://<new-server-address>:3000
```

`REACT_APP_SERVER_URL` is a build-time setting, so changing it requires the
client image to be rebuilt.

`CLIENT_ORIGIN` is supplied to the Node.js server at runtime, so the server
container needs to be recreated or restarted with the updated value.

After changing the configuration, the normal checks are:

```bash
docker compose config
docker compose build
docker compose up -d
```

The full process is covered in
[Normal Production Updates](../runbook/production-updates.md), so there is no
need to turn this section into another deployment guide.

!!! warning "The website can load even when Socket.IO is misconfigured"
    Changing the address on one side without updating the matching configuration
    on the other can leave the React site looking normal while multiplayer
    communication is completely broken.


## Chapter Summary

Madiao currently has two main pieces of environment-specific configuration.

The React client uses `REACT_APP_SERVER_URL` to decide where its Socket.IO
connection should go.

The Node server uses `CLIENT_ORIGIN` to decide which browser origin Socket.IO
should accept.

The biggest difference between them is when those values are applied:

| Variable | Applied when |
| --- | --- |
| `REACT_APP_SERVER_URL` | React client build time |
| `CLIENT_ORIGIN` | Node server runtime |

The development client uses `client/.env.development`, while the production
Docker configuration reads both application values from the root `.env` file.

Docker Compose passes `REACT_APP_SERVER_URL` into the client build and supplies
`CLIENT_ORIGIN` to the server container at runtime.

The production deployment also contains the `madiao-docs` service.

It does not need either application environment variable because its only job is
to serve the generated MkDocs site.

Lastly, `docker compose config` is one of the easiest ways of checking the
resolved production Docker configuration before making larger changes.

The setup itself is fairly small, but understanding where these values come from
is important because a configuration problem can leave the visual website
working normally while the actual multiplayer connection is completely broken.