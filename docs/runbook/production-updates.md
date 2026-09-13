# Normal Production Updates

Once the first production setup has been completed, most future deployments are
much simpler.

There is no need to clone the repository again, recreate the Docker setup or
repeat all of the first-time preparation. The production server already has a
working copy of the project and Docker already knows how the production
services should be built.

A normal update is therefore mostly a case of bringing the production repository
up to date, rebuilding the images and replacing the running containers with the
new version.

The basic flow is:

```mermaid
flowchart TD
    Check["Check the current production copy"]
    Pull["Pull the latest code"]
    Config["Validate Docker configuration"]
    Build["Build new images"]
    Replace["Replace the running containers"]
    Status["Check container status and logs"]
    Test["Test the updated deployment"]

    Check --> Pull --> Config --> Build --> Replace --> Status --> Test
```

Although the process is short, it is still worth doing the checks in order.

Production is generally the worst place to discover that an unexpected local
file was changed or that the Compose configuration no longer parses correctly.


## Before Starting an Update

!!! warning "Do not replace the server during an active game"
    Madiao currently stores active lobbies, games and timers in server memory.
    Replacing or restarting `madiao-server` therefore clears all currently
    running game sessions.

    There is also no reconnection system which can restore those players
    afterwards, so production updates which replace the server should preferably
    be done when nobody is in the middle of a game.

The important part here is that not every production update has the same effect.

Updating the client or documentation does not remove the server's in-memory
game state.

Replacing the server does.

A useful way of looking at it is:

| Service replaced | Effect on active games |
| --- | --- |
| `madiao-client` | Server-side games remain running |
| `madiao-server` | Active lobbies and games are lost |
| `madiao-docs` | No effect on active games |

The actual Docker commands only take a relatively short amount of time once the
images are built, but from the point of view of an active player a server
replacement is still effectively a complete game reset.

Another useful distinction is:

```mermaid
flowchart TD
    Build["docker compose build"]
    Safe["Existing containers keep running"]

    Up["docker compose up -d"]
    Replace["Services which changed may be recreated"]
    Server{"Was madiao-server replaced?"}
    Lost["Active in-memory games are lost"]
    Keep["Existing server state remains"]

    Build --> Safe
    Up --> Replace --> Server
    Server -->|"Yes"| Lost
    Server -->|"No"| Keep
```

Building a new image does not by itself restart the live application.

The interruption happens when a running container is actually replaced.


## Entering the Production Repository

After connecting to the production server, move into the live repository:

```bash
cd ~/madiao
```

It is worth checking the current location before running Git or Docker commands:

```bash
pwd
```

The expected location should be the active production clone, for example:

```text
/home/<user>/madiao
```

This matters because an older clone or test folder may still exist elsewhere on
the server.

Running the correct command in the wrong copy of the project can be surprisingly
confusing because Git and Docker may both behave normally while nothing about the
actual production deployment changes.


## Checking Git Before Pulling

Before retrieving anything from the repository, run:

```bash
git status
```

Ideally the production copy should report something similar to:

```text
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```

The wording may vary slightly, but the important part is:

```text
working tree clean
```

The production repository should normally match the version stored in Git.

If tracked files have unexpected local changes, do not immediately pull over
them.

First work out what changed and why.

For example:

```bash
git diff
```

can show the actual changes to tracked files.

This does not modify anything.

If the local change was only an accidental or temporary edit and the repository
version is definitely the one which should be used, it can later be restored.

The more detailed recovery steps for this situation are covered in
[Dirty Production Repository](git-problems.md#dirty-production-repository) and
[`git pull` Cannot Continue](git-problems.md#git-pull-cannot-continue).

The important rule here is simply:

> Do not treat `git pull` as the first diagnostic tool for a dirty production
> repository.


## Pulling the Latest Version

Once the working tree is clean, update the local copy:

```bash
git pull
```

This brings the production repository up to date with its configured remote
branch.

Afterwards it can be useful to run:

```bash
git status
```

again.

This gives a quick confirmation that the pull completed normally and that there
are no unexpected changes left behind.

If there is any doubt about which commit is currently checked out:

```bash
git log -1 --oneline
```

shows the most recent commit.

This becomes particularly useful when comparing the production server with the
latest commit visible in the repository.


## Validating the Updated Configuration

Before rebuilding, run:

```bash
docker compose config
```

This step may feel repetitive because the Compose file often has not changed.

It is still worth doing.

A code or documentation update can include changes to:

- `compose.yaml`;
- Dockerfiles;
- production configuration;
- service names;
- port mappings;
- the documentation build.

and `docker compose config` is a cheap way of catching a broken Compose file
before starting a longer build.

For the base Madiao deployment, the three services should still correspond to:

| Service | Expected mapping |
| --- | --- |
| `client` | host `3000` → container `80` |
| `server` | host `3001` → container `3001` |
| `docs` | host `3002` → container `80` |

The resolved configuration should also contain the expected application
configuration.

In particular:

- the client build should receive `REACT_APP_SERVER_URL`;
- the server should receive `CLIENT_ORIGIN`;
- the documentation service should use the project root as its build context.

If the command reports an error, stop there and fix the configuration before
continuing.


## Rebuilding the Application

Build the new images with:

```bash
docker compose build
```

This processes the production services defined in the Compose file.

At the moment those are:

```text
client
server
docs
```

Docker will normally reuse unchanged build layers, so later builds may be much
quicker than the first deployment.

However, whether the build takes a few seconds or several minutes depends on
what actually changed.

For example:

| Change | Likely rebuild effect |
| --- | --- |
| CSS or React source | Client image |
| `server/index.js` or game logic | Server image |
| Client `package-lock.json` | Client dependency layer |
| Server `package-lock.json` | Server dependency layer |
| Markdown in `docs/` | Documentation image |
| `mkdocs.yaml` | Documentation image |
| Root documentation Dockerfile | Documentation image |

The documentation image has its own build step because MkDocs converts the
Markdown files into a static website before nginx serves them.

This means a changed Markdown file is similar to changed application source in
one important way:

> restarting the existing container is not enough.

The documentation image needs to be rebuilt before the generated site changes.

The same general rule applies to the client.

A successful:

```bash
docker compose build
```

does not mean the new version is live yet.

At this point the currently running containers can still be using the previous
images.

This is useful because it gives us a natural checkpoint.

!!! tip "A failed build does not automatically break the live version"
    Until `docker compose up -d` replaces a service, the existing production
    containers can continue running the previous image.

    A build failure is therefore a reason to stop and fix the build, not to
    start changing the live containers.

If the build fails, the existing production containers have not automatically
been replaced and may still be running the previous working version.

Do not continue to the replacement step until the build finishes successfully.

If the build itself fails,
[Build and Dependency Problems](build-problems.md) covers the main failure
points, including [`npm ci` Failure](build-problems.md#npm-ci-failure),
[Docker Build Failure](build-problems.md#docker-build-failure) and
[React Build Failure](build-problems.md#react-build-failure).


## Replacing the Running Containers

Once the images have built successfully, apply them with:

```bash
docker compose up -d
```

Docker Compose compares the running services with the current configuration and
images.

If a service needs to be recreated, Compose replaces that container and starts
the new version.

The normal result should leave all three production containers running:

```text
madiao-client
madiao-server
madiao-docs
```

This is the point where the earlier warning about active games becomes relevant.

If `madiao-server` is recreated, all of the in-memory Maps used for lobbies,
game state, timers and socket/lobby links are created again from scratch.

Any active match therefore disappears.

Replacing only `madiao-client` or `madiao-docs` does not clear that server-side
state.

For that reason it is usually better to think of:

```bash
docker compose up -d
```

as the actual deployment step, while:

```bash
docker compose build
```

is only preparation for the deployment.


## Checking Container Status

Immediately after the update, check the containers:

```bash
docker ps --filter "name=madiao"
```

All three should show as running.

The expected containers are:

```text
madiao-client
madiao-server
madiao-docs
```

The same deployment can also be checked with:

```bash
docker compose ps
```

If one is missing, use:

```bash
docker ps -a --filter "name=madiao"
```

This also shows stopped containers.

A service which starts and crashes immediately may disappear from normal
`docker ps`, while still being visible in `docker ps -a`.

This is usually much more useful than repeatedly running:

```bash
docker compose up -d
```

and hoping the next attempt behaves differently.


## Checking Logs

Once the containers are up, check the server log:

```bash
docker logs madiao-server --tail 50
```

The server should start normally and report that it is listening on port `3001`.

Then check the client:

```bash
docker logs madiao-client --tail 50
```

and the documentation container:

```bash
docker logs madiao-docs --tail 50
```

For the two nginx containers there may not be very much output until requests
reach them.

If one service has a startup problem, the logs are normally the next place to
look.

More log commands, including following output live, are collected in
[Viewing Logs](docker-operations.md#viewing-logs).

The useful order is:

```mermaid
flowchart TD
    Status["Check container status"]
    Logs["Read the relevant container logs"]
    Cause["Investigate the code or configuration suggested by the error"]

    Status --> Logs --> Cause
```

rather than immediately changing unrelated files.


## Testing the Updated Version

A deployment should be checked after the containers are replaced.

For the base deployment, confirm that:

```text
http://<server-address>:3000
```

still loads the client,

```text
http://<server-address>:3001
```

still reaches the Node.js server,

and:

```text
http://<server-address>:3002
```

still loads the documentation.

The amount of testing required after that depends on what actually changed.


### Application update

If the client or server changed, perform a small multiplayer check.

For a routine update this does not need to be a full match.

A useful minimum is:

```mermaid
flowchart TD
    Create["Create a lobby"]
    Join["Join from a second client"]
    Start["Start the game"]
    Update["Confirm both clients update"]
    Play["Perform one normal play"]

    Create --> Join --> Start --> Update --> Play
```

If the update specifically changed a certain system, naturally that system
should also be tested.

For example:

| Area changed | Targeted check |
| --- | --- |
| Challenge logic/UI | Test a challenge |
| Timer behaviour | Allow a full turn/timer sequence to run |
| Game-over behaviour | Test a short match if practical |
| Lobby behaviour | Specifically test create/join/start |

The general multiplayer check proves that the application still works.

The targeted test proves that the feature which was actually changed works.


### Documentation update

If only the documentation changed, there is no reason to perform a complete
multiplayer test purely because of that change.

Instead, check:

```text
http://<server-address>:3002
```

and open the pages which were edited.

It is also worth checking:

- navigation;
- code blocks;
- Mermaid diagrams;
- internal links;
- custom styling.

The documentation container is independent from the game containers, so a
documentation-only deployment can be tested without interrupting an active
match.


## Confirming the Correct Git Version Is Live

It can occasionally be useful to record or check the deployed commit.

Run:

```bash
git log -1 --oneline
```

This gives a short commit identifier and message.

For example:

```text
abc1234 Fix challenge result timing
```

This does not prove by itself that Docker rebuilt every required service
correctly, but it proves which source version exists in the production
repository.

Combined with:

```bash
docker compose build
docker compose up -d
```

it gives a reasonably clear deployment trail:

```mermaid
flowchart TD
    Commit["Git commit"]
    Image["Docker image"]
    Container["Running container"]

    Commit --> Image --> Container
```

If something unexpected appears in production, knowing the deployed commit
makes it much easier to compare that version with Git history or a previous
release.

If the new version needs to be backed out, the full procedure is covered in
[Recovery and Rollback](rollback.md).


## Updating Only One Service

Most normal deployments can simply rebuild the complete Compose project:

```bash
docker compose build
docker compose up -d
```

For a project of this size this is straightforward and reduces the chance of
forgetting that a change affected more than one service.

However, Docker Compose can also rebuild a single service when the change is
clearly isolated.


### Client-only update

For a client-only change:

```bash
docker compose build client
docker compose up -d client
```

This can be useful for changes such as:

- CSS;
- layout;
- React components;
- images;
- client build configuration.

Replacing only the client does not remove the server's active in-memory games.


### Server-only update

For a server-only change:

```bash
docker compose build server
docker compose up -d server
```

This can be useful for changes such as:

- lobby handling;
- game rules;
- Socket.IO handlers;
- server timers;
- server dependencies.

Replacing the server clears all active lobbies and games.


### Documentation-only update

For a documentation-only change:

```bash
docker compose build docs
docker compose up -d docs
```

This is useful for changes to:

- files inside `docs/`;
- `mkdocs.yaml`;
- documentation stylesheets;
- the root documentation Dockerfile.

This is one of the safest isolated updates because replacing `madiao-docs` does
not affect the client, server or active game state.

The operational difference is therefore:

| Update | Effect on active games |
| --- | --- |
| Client-only | Active server games can continue |
| Server | Active in-memory games are lost |
| Documentation-only | No effect on active games |

This does not mean every update should automatically be split into individual
services.

It simply gives us an option when the change is clearly isolated.


## Normal Update Command Sequence

For most normal deployments the shortened procedure is:

```bash
cd ~/madiao

git status
git pull

docker compose config
docker compose build
docker compose up -d

docker ps --filter "name=madiao"

docker logs madiao-server --tail 50
docker logs madiao-client --tail 50
docker logs madiao-docs --tail 50

git log -1 --oneline
```

Then test the parts of the deployment which were affected.

For a normal application update, that means checking the client, server and a
basic multiplayer flow.

For a documentation-only update, checking the documentation site and the edited
pages is normally enough.

The sequence is intentionally simple.

Each step answers one useful question:

| Step | Question |
| --- | --- |
| `git status` | Is the production repository safe to update? |
| `git pull` | Do I now have the latest source code? |
| `docker compose config` | Does Docker understand the configuration? |
| `docker compose build` | Can the new version be built successfully? |
| `docker compose up -d` | Is the new version now running? |
| `docker ps` | Did the containers stay up? |
| `docker logs` | Did the services start normally? |
| Browser/game/docs test | Does the part which changed actually work? |

That is generally enough for a normal Madiao production update.


## Chapter Summary

Normal production updates are much shorter than the first deployment because the
server already contains a working Git clone and Docker setup.

The usual process is:

```mermaid
flowchart TD
    Status["git status"]
    Pull["git pull"]
    Config["docker compose config"]
    Build["docker compose build"]
    Up["docker compose up -d"]
    Containers["Check containers"]
    Logs["Check logs"]
    Test["Test the affected services"]

    Status --> Pull --> Config --> Build --> Up --> Containers --> Logs --> Test
```

The base production deployment currently contains three Docker services:

```text
madiao-client
madiao-server
madiao-docs
```

The client and server make up the actual game, while the documentation container
serves the generated MkDocs site alongside them.

The most important operational detail is still the difference between building
and replacing containers.

`docker compose build` prepares new images but does not by itself remove the
running services.

`docker compose up -d` may recreate whichever containers need to change.

If that includes `madiao-server`, all active in-memory lobbies and matches are
cleared.

Replacing the client or documentation container does not have that same effect.

Lastly, the production repository should normally remain clean and match the
version stored in Git.

If unexpected tracked changes appear on the server, work out what they are
before pulling or overwriting anything.