# Madiao Production Runbook

Madiao has grown quite a bit from what originally started as a fairly simple
multiplayer friends card game project. Over time, more systems were added around the
game itself, including multiplayer lobbies, game timers, challenges, drinking
sequences, rematches and eventually the Docker-based production deployment.

While most of these systems are fairly straightforward once they are understood,
there are enough different parts working together that remembering exactly how
everything works can become difficult after spending some time away from the
project. This is especially true with things such as Docker commands, Socket.IO
events or some of the less obvious parts of the game flow, which might make
perfect sense while actively working on them but can be surprisingly easy to
forget a few months later.

The purpose of this runbook is therefore to keep the important operational parts
of Madiao written down in one place.

It covers how the production version is deployed and updated, how the main
systems of the game work together, where some of the more important parts of the
code can be found and, probably most importantly, what should be checked when
something stops behaving the way it should.

The runbook is not intended to replace the README or any more detailed technical
documentation. Its purpose is slightly different. Rather than trying to explain
every design decision or every line of code, it focuses on the parts that are
useful when maintaining, running or troubleshooting the project.


## How to Use This Runbook

I have written it, so it can be used in two slightly different ways.

If it has been a while since working on the project, the introductory parts of
each section provide some context around what the system does, why it exists and
how it normally works. The idea is that reading these parts should provide enough
of a reminder to understand what is happening without having to immediately start
digging through the source code again.

On the other hand, if the problem is already understood and the only thing needed
is a command or solution, the troubleshooting sections are deliberately separated
into individual problems, checks and fixes. In that case most of the background
information can simply be skipped.

Code, commands and file paths are also separated from the normal text wherever
possible. This makes them easier to find when quickly scanning through the
document and prevents important commands from becoming buried inside larger
paragraphs.