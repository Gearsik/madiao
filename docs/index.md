# Madiao Documentation

Madiao has grown quite a bit from what originally started as a fairly simple
multiplayer card game project. Over time, more systems were added around the
game itself, including multiplayer lobbies, game timers, challenges, drinking
sequences, rematches and eventually the Docker-based production deployment.

While most of these systems are fairly straightforward once they are understood,
there are enough different parts that depend on each other that remembering
exactly how everything works can become difficult after spending some time away
from the project.

This is especially true with things such as Docker commands, Socket.IO events,
server-side game state or some of the less obvious parts of the game flow, which
might make perfect sense while actively working on them but can be surprisingly
easy to forget a few months later.

The purpose of this documentation is therefore to keep the important parts of
Madiao written down in one place.

Rather than separating the project into several completely different documents,
this site combines the technical documentation and the production runbook. The
technical sections explain how the application is structured and how its main
systems work, while the runbook sections focus more on deploying, maintaining,
troubleshooting and recovering the live version of the game.

The documentation is not intended to explain every individual line of code.
Instead, it focuses on the parts which are most useful when returning to the
project, trying to understand how one system connects to another, or working out
what should be checked when something stops behaving the way it should.


## How to Use This Documentation

The site is written so it can be used in a few different ways depending on what
is needed at the time.

If it has been a while since working on the project, the technical sections
provide enough context to rebuild an understanding of how the application works
without immediately having to dig through the source code again.

If the aim is to deploy or maintain the production version, the runbook sections
focus on the actual commands, checks and procedures needed to work with Git,
Docker and the live server.

On the other hand, if the problem is already understood and the only thing
needed is a command or a quick reminder, the troubleshooting and quick-reference
pages are deliberately written so most of the surrounding explanation can be
skipped.

Code, commands and file paths are separated from the normal text wherever
possible. This makes them easier to find when quickly scanning through a page
and prevents important commands from becoming buried inside larger paragraphs.


## Where to Start

| If you want to... | Start here |
| --- | --- |
| Understand how the production version is structured | [Project and Runtime Overview](technical/runtime-overview.md) |
| Understand the repository and where things are kept | [Repository and File Structure](technical/repository-structure.md) |
| Understand environment variables and configuration | [Environment and Configuration](technical/environment-configuration.md) |
| Deploy Madiao on a new server | [First-Time Production Setup](runbook/first-time-setup.md) |
| Update the live version | [Normal Production Updates](runbook/production-updates.md) |
| Understand the game state and server runtime | [Server Runtime State](technical/server-runtime-state.md) |
| Follow the game phases and turn sequence | [Game Phase and Turn Flow](technical/game-phase-and-turn-flow.md) |
| Understand the timers | [Timer System](technical/timer-system.md) |
| Understand the Socket.IO events | [Socket.IO Events](technical/socketio-events.md) |
| Diagnose something which is not working | [Troubleshooting by Problem](runbook/troubleshooting.md) |
| Recover from a failed deployment | [Recovery and Rollback](runbook/rollback.md) |
| Find a command quickly | [Quick Reference](runbook/quick-reference.md) |


## Documentation Structure

The navigation on the left divides the documentation into a few smaller groups
rather than treating everything as one long document.

<div class="grid cards" markdown>

-   **Overview**

    Rebuild the high-level picture of how the application, repository and
    production configuration fit together.

    [Start with Project and Runtime Overview →](technical/runtime-overview.md)

-   **Deployment and Docker**

    Set up the production server, deploy the application, update it and manage
    the two Docker services.

    [Start with First-Time Production Setup →](runbook/first-time-setup.md)

-   **Technical Reference**

    Follow the application code, server state, game phases, timers and
    Socket.IO communication in more detail.

    [Start with Application Code Map →](technical/application-code-map.md)

-   **Operations and Troubleshooting**

    Check the live application, narrow down problems and recover from failed
    deployments or Git issues.

    [Start with Basic Health Checks →](runbook/health-checks.md)

-   **Security and Limitations**

    Review the current trust boundaries, repository/security considerations and
    the operational limitations which still exist.

    [Start with Security and Repository Notes →](technical/security.md)

-   **Quick Reference**

    Skip the surrounding explanation and go directly to the commands, paths and
    checks used most often.

    [Open Quick Reference →](runbook/quick-reference.md)

</div>
