# First-Time Production Setup

The previous technical pages explain what Madiao is made out of and where its
configuration comes from. The next useful step is putting those pieces together
and going through what is required to get a completely fresh production copy of
the game running.

This chapter is specifically about deploying Madiao for the first time on a
server which has already been prepared for application hosting.

If the Linux machine itself still needs to be prepared, start with
[Server Setup and Administration](server-setup-and-administration.md). That page
covers the initial SSH key, sudo user, SSH hardening, automatic security updates
and basic `systemd` setup.

Normal Madiao updates are slightly different because most of the application
setup has already been completed. Those are covered in
[Normal Production Updates](production-updates.md#normal-update-command-sequence).

The general process is:

```mermaid
flowchart TD
    Prepare["Prepare the server"]
    Clone["Clone the repository"]
    Config["Check production configuration"]
    Validate["Validate Docker Compose"]
    Build["Build the client and server images"]
    Start["Start the containers"]
    Check["Check and test the deployment"]

    Prepare --> Clone --> Config --> Validate --> Build --> Start --> Check
```

There are not actually many steps involved, however, doing them in this order
makes it easier to catch a configuration problem before reaching the point where
containers are already running.


## Server Requirements

This section assumes the basic Linux and SSH preparation from
[Server Setup and Administration](server-setup-and-administration.md) has already
been completed.

The production machine does not need the same development setup as the computer
used to write the game.

In particular, Node.js and npm do not need to be installed directly on the
server just for Madiao.

The Docker images already define the environments needed by both parts of the
application.

The production server mainly needs:

| Requirement | Why it is needed |
| --- | --- |
| Git | Obtains and updates the project from the repository |
| Docker Engine | Builds and runs the application containers |
| Docker Compose plugin | Manages the client and server together |

Node.js and npm do not need to be installed directly on the host just for
Madiao because the Docker images provide those environments.


### Checking Git

Git can be checked with:

```bash
git --version
```

A version number means it is available.


### Checking Docker

Docker can be checked with:

```bash
docker --version
```

and the Compose plugin with:

```bash
docker compose version
```

The important detail here is that the project uses the newer:

```bash
docker compose
```

form rather than the older standalone:

```text
docker-compose
```

command.


### Network access

The server also needs to allow incoming traffic to the ports used by Madiao.

The current production setup exposes:

| Port | Purpose |
| ---: | --- |
| `3000` | React client served through nginx |
| `3001` | Node.js / Socket.IO server |

!!! warning "Running containers do not guarantee external access"
    If ports `3000` or `3001` are blocked by the host firewall or the hosting
    provider's firewall, the containers can be healthy while the application is
    still unreachable from another computer.

This is therefore worth checking early rather than assuming every failed browser
connection is a Docker problem.


## Cloning the Repository

The production copy should come from the Git repository rather than from a
folder manually copied from the development computer.

This gives us a clean source of truth and makes future updates much easier.

A typical clone looks like:

```bash
cd ~
git clone <repository-url> madiao
cd madiao
```

The exact repository URL is deliberately not written into this public runbook.
It can be copied from the repository itself when needed.

Using a predictable folder name such as `~/madiao` is useful because later
deployment commands can assume the same project location.

Once inside the new clone, the first thing worth checking is:

```bash
git status
```

A brand-new clone should normally report a clean working tree.

It is useful to establish that before making any server-specific configuration
changes because the production repository should stay as close to the Git
version as possible.


## Checking Production Configuration

Before building anything, the production addresses need to be correct.

As covered in the previous chapter, there are two main values involved:

| Value | What it controls |
| --- | --- |
| `REACT_APP_SERVER_URL` | Where the browser should connect for Socket.IO |
| `CLIENT_ORIGIN` | Which browser origin the server is allowed to accept |



### Client production address

The React production value is read from `client/.env.production`.

It should point to the externally reachable game server, for example:

```env title="client/.env.production"
REACT_APP_SERVER_URL=http://<server-address>:3001
```

!!! warning "Do not use localhost for the public client build"
    `REACT_APP_SERVER_URL` must contain an address the player's browser can
    reach. Using `http://localhost:3001` in a public production build would make
    each player's browser try to connect to port `3001` on their own machine.

The production value should therefore use the externally reachable server
address.


### Server allowed origin

The server receives `CLIENT_ORIGIN` through `docker-compose.yml`.

The value should match the address from which players load the client, for
example:

```yaml
environment:
  CLIENT_ORIGIN: http://<client-address>:3000
```

For the current deployment both services are hosted on the same machine, but
they still use different ports:

```mermaid
flowchart TD
    Browser["Player's browser"]
    Client["Client origin<br/>http://<server-address>:3000"]
    Server["Game server<br/>http://<server-address>:3001"]

    Browser -->|"Loads React from"| Client
    Browser -->|"Socket.IO connects to"| Server
```


## Validating Docker Compose

Before starting a build, validate the Compose file:

```bash
docker compose config
```

!!! tip "Validate before building"
    Run `docker compose config` after changing the Compose file or its
    configuration. It catches YAML and Compose-structure problems before time is
    spent building either image.

This is one of the safest checks in the deployment process because it does not
start or replace anything.

It simply asks Docker Compose to read the configuration and show the final
result it understands.

A successful result should contain both services and the expected port
mappings:

| Service | Expected mapping |
| --- | --- |
| `client` | `3000 -> 80` |
| `server` | `3001 -> 3001` |

It is also worth checking the resolved `CLIENT_ORIGIN` while looking through the
output.

If Docker Compose reports a YAML or configuration error here, fix that before
continuing.

There is very little value in trying to build containers from a configuration
Docker already says is invalid.


## Building the Images

Once the configuration looks correct, build both services:

```bash
docker compose build
```

Docker will build the client and server separately.

At a simplified level:

```mermaid
flowchart TD
    ClientSource["client/ + Dockerfile"]
    ClientImage["madiao client image"]
    ClientRuntime["React production build served by nginx"]

    ServerSource["server/ + Dockerfile"]
    ServerImage["madiao server image"]
    ServerRuntime["Node.js application"]

    ClientSource --> ClientImage --> ClientRuntime
    ServerSource --> ServerImage --> ServerRuntime
```

The first build may take longer than later ones because Docker has no previous
layers cached yet.

The client also has to install its npm dependencies and run the full React
production build.

A successful build should finish without an npm, React or Docker error.

If one service fails, do not immediately move on to `docker compose up`.

The failed image needs to be fixed first.

If the build fails, [Build and Dependency Problems](build-problems.md) covers
the main places worth checking. The most relevant sections are
[`npm ci` Failure](build-problems.md#npm-ci-failure),
[Docker Build Failure](build-problems.md#docker-build-failure) and
[React Build Failure](build-problems.md#react-build-failure), depending on which
build step actually failed.


## Starting the Containers

Once both images have built successfully, start the application with:

```bash
docker compose up -d
```

!!! note "Building and deploying are separate steps"
    `docker compose build` creates the images. The new version is not applied to
    the running services until `docker compose up -d` recreates or starts the
    relevant containers.

The `-d` means detached mode.

Without it, the terminal stays attached to the container output.

With it, Docker starts the services in the background and returns control of the
terminal.

The expected containers are `madiao-client` and `madiao-server`.

The current Compose setup also uses `restart: unless-stopped`, which means
Docker will normally try to bring the containers back after a host restart
unless they were deliberately stopped.


## Checking the Running Containers

After starting the application, check what is actually running:

```bash
docker ps --filter "name=madiao"
```

Both containers should appear.

The important information is mainly the container name, status and published
ports.

The expected result is roughly:

| Container | State | Published port |
| --- | --- | --- |
| `madiao-client` | `Up` | `0.0.0.0:3000 -> 80` |
| `madiao-server` | `Up` | `0.0.0.0:3001 -> 3001` |

The exact formatting depends on the Docker version, but both containers should
be in an `Up` state.

If one is missing, check all containers including stopped ones:

```bash
docker ps -a --filter "name=madiao"
```

A container which starts and immediately exits will often appear there even
though it is absent from the normal `docker ps` output.


## Checking the Logs

A container being listed as `Up` is a good sign, but it does not automatically
prove the application inside it is behaving correctly.

Check the server log:

```bash
docker logs madiao-server --tail 50
```

The server should eventually report that it is listening on port `3001`.

Then check the client:

```bash
docker logs madiao-client --tail 50
```

For the nginx container there may not be much interesting output before anybody
visits the site.

The main point is that there should not be a repeating crash, missing-file error
or other obvious startup failure.


## Testing the Server Directly

Before testing the full game, it is useful to check the server separately.

The Node server has a basic Express route on port `3001`.

Opening `http://<server-address>:3001` should return the simple Madiao server
page.

This does not test Socket.IO gameplay, but it confirms several useful things at
once:

- the server container is running;
- the Node.js process started;
- port `3001` is published;
- the network allows the connection.

If this page cannot be reached, there is little point debugging the React game
screen yet.

The problem is further down the stack.


## Testing the Client

Next, open `http://<server-address>:3000`.

The Madiao client should load.

If the server page on `3001` works but the client does not load on `3000`, the
problem is much more likely to be on the client/nginx side.

If the client loads but cannot create or join lobbies, the visual part of the
site is already working and the Socket.IO connection becomes the next thing to
check.


## Basic Multiplayer Test

A first deployment should not really be considered finished just because the
home screen loads.

Madiao is a multiplayer application, so the final check should involve the
actual game flow.

A small test is enough:

1. Open the client in one browser window.
2. Create a lobby.
3. Open the client from another browser or device.
4. Join using the lobby code.
5. Confirm both players appear in the lobby.
6. Start the game.
7. Confirm both players receive their hands.
8. Play at least one declaration.
9. Confirm the state updates on both clients.

There is no need to play an entire match after every first deployment.

The purpose is simply to prove that nginx is serving the client, Socket.IO is
connected, lobby events work, server state reaches both clients, private hands
are delivered correctly and gameplay events are accepted.

If all of those work, the core deployment is operating properly.


## Useful First-Deployment Command Sequence

Once the setup is understood, the main commands can be reduced to a fairly short
sequence:

```bash
cd ~/madiao

git status

docker compose config

docker compose build

docker compose up -d

docker ps --filter "name=madiao"

docker logs madiao-server --tail 50

docker logs madiao-client --tail 50
```

After that, test `http://<server-address>:3001` and
`http://<server-address>:3000`, then perform a small multiplayer test.

It is deliberately better to keep these checks separate rather than putting
everything into one large command.

If something fails, the point at which it failed immediately gives us a clue
about which part of the deployment needs attention.


## Chapter Summary

A fresh Madiao production setup does not require a particularly complicated
server.

The host mainly needs Git, Docker and the Docker Compose plugin.

The project is cloned from the repository, the production client/server
addresses are checked, and Docker Compose is validated before anything is built.

The main first-time deployment sequence is:

```mermaid
flowchart TD
    Clone["Clone"]
    Configure["Configure production addresses"]
    Config["docker compose config"]
    Build["docker compose build"]
    Up["docker compose up -d"]
    Containers["Check containers"]
    Logs["Check logs"]
    Server["Test server"]
    Client["Test client"]
    Multi["Test multiplayer"]

    Clone --> Configure --> Config --> Build --> Up --> Containers --> Logs --> Server --> Client --> Multi
```

The two production containers should end up as:

| Container | Host → container |
| --- | --- |
| `madiao-client` | `:3000 -> :80` |
| `madiao-server` | `:3001 -> :3001` |

Lastly, a working web page is only part of the test.

Because the client and multiplayer server are separate, the first deployment
should always be checked far enough to prove that two players can actually
connect to the same lobby and exchange game state.
