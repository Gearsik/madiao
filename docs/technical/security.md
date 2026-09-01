# Security and Repository Notes

Madiao is currently a fairly small project and does not yet have things such as
user accounts, a database or third-party API integrations.

That keeps the security side considerably simpler than it would be for a larger
production application.

Even so, there are still a few things which should be kept clear when working
with Git and the production server.

The main distinction is between **project information** and **credentials or
secrets which grant access**.

| Type | Example |
| --- | --- |
| Project information | Source code, documentation, public addresses, normal configuration |
| Access credential | Private SSH key, password, token, private certificate |

Source code, documentation, public server addresses and normal configuration can
all be perfectly reasonable things to store in Git.

Private SSH keys, passwords, access tokens and future database credentials are
different.

Those should never become part of the repository simply because the application
needs them somewhere at runtime.

A useful general rule is:

> Git should contain enough information to understand and rebuild the project,
> but it should not contain the private credentials required to access the
> machines or services around it.


## What Can Be Stored in Git

Most of the Madiao repository is normal project material and should remain
version-controlled.

Examples include:

- React source code;
- Node.js server code;
- CSS;
- SVG/image assets;
- Dockerfiles;
- `docker-compose.yml`;
- `package.json`;
- `package-lock.json`;
- shared timing constants;
- README and CHANGELOG;
- MkDocs configuration;
- runbook/documentation.

These files describe how the application works.

Keeping them in Git means they can be reviewed, versioned, restored, compared
and deployed consistently, which is exactly what the repository is for.

which is exactly what the repository is for.


### Public addresses are not automatically secrets

Madiao currently uses values such as `REACT_APP_SERVER_URL` and
`CLIENT_ORIGIN`.

These contain addresses used by the browser and server to find each other.

An address such as `http://<server-address>:3001` is not a password.

The player's browser ultimately has to know where the Socket.IO server is, so the
server address cannot realistically be hidden from somebody using the website.

Likewise, the client origin is the public address the server is expecting
requests from.

These values should still be kept accurate, but they do not need to be treated
as though revealing them would grant somebody administrative access to the
server.


### Code which contains rules is also not a secret

Things such as deck composition, turn duration, challenge rules, drunkness
probabilities and Socket.IO event names are part of how the game works.

Keeping them private would not be a meaningful security boundary.

The important security boundary is that the **server** remains authoritative
rather than trusting a modified browser client.


## What Should Stay Private

Anything which proves identity or grants access should be treated differently.

Examples include:

- SSH private keys;
- GitHub personal access tokens;
- deployment tokens;
- database passwords;
- API keys;
- session/signing secrets;
- cloud-provider credentials;
- private certificates.

Madiao does not currently use most of these, but they become relevant if the
project grows later.


### A simple test

Before committing a value, ask:

> If somebody copied this value from a public repository, could they use it to
> sign in, authenticate, spend money, modify data or impersonate the server?

If the answer is yes, it should not be committed.


### Public key vs private key

SSH is a good example.

The practical process of generating the key pair and putting the public key onto
the server is covered in
[Generate an SSH Key Pair](../runbook/server-setup-and-administration.md#generate-an-ssh-key-pair)
and
[Configure SSH Key Authentication for the Sudo User](../runbook/server-setup-and-administration.md#configure-ssh-key-authentication).

An SSH key pair contains a public key and a private key.

| Key | How it should be treated |
| --- | --- |
| Public key | Designed to be placed on servers and can generally be shared |
| Private key | Proves ownership of the public key and must remain private |

The private key should remain on the machine which uses it and outside the
project repository.


## Environment Files

The current Madiao environment setup is described in
[Environment and Configuration](environment-configuration.md#environment-files-and-git). This section
focuses specifically on which values should be treated as public configuration
and which kinds of values would need to remain private.

Environment files can be slightly confusing because `.env` often gets
treated as though the filename itself automatically means **secret**.

That is not always true.

An environment file is simply one way of providing configuration.

Whether the values are sensitive depends on what the values actually contain.


### Current client environment

The current React production build reads `client/.env.production` and uses
`REACT_APP_SERVER_URL` from it. The reason this value is applied during the build rather than at client
runtime is covered in
[Why the Client Variable Is a Build-Time Setting](environment-configuration.md#why-the-client-variable-is-a-build-time-setting).

That value becomes part of the browser JavaScript during:

```bash
npm run build
```

so it must be treated as public regardless of whether the source environment
file itself is committed or ignored.

!!! warning "React environment variables are browser-visible"
    Anything stored under a `REACT_APP_*` name can eventually be inspected by
    somebody using the built website.

    Never put passwords, private API keys, session secrets or similar
    credentials into a React environment variable.

For example, values such as these would be inappropriate:

```env
REACT_APP_DATABASE_PASSWORD=...
REACT_APP_PRIVATE_API_KEY=...
REACT_APP_SESSION_SECRET=...
```


### Server-side environment values can be private

A Node.js server can receive environment variables which never need to reach the
browser.

For example, if Madiao later gains a database, the server could receive
`DATABASE_URL`, `DATABASE_PASSWORD` and `SESSION_SECRET` without exposing those
values to React.

Those should normally come from a private production environment or secret
management system and should not be committed to Git.


### Current `CLIENT_ORIGIN`

The current `CLIENT_ORIGIN` value is not a credential.

It is used by Socket.IO to decide which browser origin is allowed by the CORS
configuration.

It can therefore be stored as ordinary deployment configuration.

However, if the Compose file later starts receiving genuine secrets, those
values should not simply be written directly into a committed YAML file.


### Example files

If a project needs private environment values, a useful pattern is:

| File | Git treatment | Purpose |
| --- | --- | --- |
| `.env.example` | Committed | Variable names and safe example/blank values |
| `.env` | Ignored | Real machine-specific or private values |

For example:

```env
DATABASE_URL=
SESSION_SECRET=
```

The example file tells somebody what needs to exist without giving them the
production credentials.


## SSH Keys and Credentials

The production server is normally managed through SSH.

The complete practical setup, including the sudo user, `authorized_keys`
permissions, SSH hardening and disabling remote root/password login, is
documented in
[Server Setup and Administration](../runbook/server-setup-and-administration.md#ssh-hardening).

This section focuses on how the credentials themselves should be treated.

The SSH private key used to connect should remain in the user's SSH directory,
for example `~/.ssh/`, rather than anywhere underneath the `Madiao/` project
folder.

The project repository should never need a copy of the private key in order to
deploy itself.


### Do not copy a private key into the repository for convenience

A structure such as this would be a bad idea:

```text
Madiao/
├── client/
├── server/
└── server-key
```

Even if `server-key` were later added to `.gitignore`, the safer location is
outside the repository entirely.


### Git SSH credentials

The production server may also use SSH when pulling from the Git repository.

The same rule applies.

The credential should live in the server user's SSH configuration rather than
inside `docker-compose.yml`, a Dockerfile, README, runbook or shell script
committed to Git.


### Never paste private key contents into documentation

The runbook can explain where the key should live, how SSH access is used and
how to check the Git remote without containing the actual private key.

For example:

```bash
git remote -v
```

is safe and useful.

A block beginning with `-----BEGIN OPENSSH PRIVATE KEY-----` does not belong
in the documentation or repository.


### Passwords and tokens follow the same rule

If GitHub access later uses a token rather than SSH, the token should not be
written directly into documentation, Compose files, Dockerfiles or Git remote
URLs committed in text files.

A credential which works from a command line is still a credential when copied
into Markdown.


## `.gitignore` Is Helpful, but Not a Security System

The root `.gitignore` exists partly to stop local or generated files from being
accidentally added to Git.

The wider repository layout and the kinds of files deliberately kept outside Git
are covered in
[Files Kept Outside Git](repository-structure.md#files-kept-outside-git).

The project already treats things such as local environments, generated folders
and common credential/key files as material which should normally stay outside
the repository.

For the documentation setup, for example, `.venv-docs/` is ignored because
the Python environment is local tooling rather than project source.

!!! note "`.gitignore` is not a security boundary"
    `.gitignore` helps prevent files from being added in the future, but it does
    not remove a file which Git is already tracking and it does not erase that
    file from earlier commits.

If Git is **already tracking** a file, adding its name to `.gitignore` does not
remove it from the repository.


### Check whether Git is tracking a file

Use:

```bash
git ls-files path/to/file
```

If Git prints the path, the file is tracked.


### Check why a file is ignored

Use:

```bash
git check-ignore -v path/to/file
```

This shows the ignore rule responsible for excluding it.

For example:

```bash
git check-ignore -v .venv-docs
```


### Ignore rules are a safety net

They reduce accidental commits.

They should not replace the habit of checking:

```bash
git status
```

and reviewing a commit before pushing it.


## Repository Visibility

The repository can be public or private without changing most of the rules in
this chapter.

A private repository is not a safe place to store passwords simply because fewer
people can see it.

There are several reasons:

- repository access may change later;
- collaborators may be added;
- the repository may eventually become public;
- Git history keeps old versions;
- credentials may be copied into backups or clones.

Secrets should therefore be handled as secrets regardless of repository
visibility.


### Public documentation

The runbook itself is intended to be safe to keep alongside the code.

Because of that, examples should use placeholders such as
`<server-address>`, `<repository-url>`, `<username>` and `<token>` rather than
embedding credentials or unnecessary account-specific details.

The documentation should teach how the deployment works without becoming a list
of access details for the live machine.


## Accidentally Committed Secrets

If a real secret is accidentally committed, deleting the line in a later commit
is not enough.

Git keeps the earlier commit in its history.

!!! danger "Rotate or revoke the secret first"
    Treat the exposed credential as compromised. Make it useless before spending
    time cleaning the repository history.

The response should then be treated as two separate jobs:

1. Make the exposed credential useless.
2. Remove the credential from the repository/history where appropriate.


### Step 1 — Rotate or revoke the credential

Assume the credential may already have been copied.

Depending on what was exposed:

| Credential | Immediate response |
| --- | --- |
| SSH key | Remove its public key from authorised access and create a new key pair |
| GitHub token | Revoke it and generate a replacement |
| API key | Rotate or revoke it with the provider |
| Database password | Change the database credential |
| Session secret | Replace it |

Even if the repository was private or the secret was visible only briefly, the
safe assumption is that the old credential should no longer be trusted.


### Step 2 — Remove it from the current version

Remove the secret from the file.

If the whole file should never be tracked, add an appropriate ignore rule and
remove it from Git's index without deleting the local copy:

```bash
git rm --cached path/to/private-file
```

Then commit the change.

For example:

```mermaid
flowchart TD
    Remove["Remove the secret from the source file"]
    Ignore["Add an ignore rule if the file should stay local"]
    Untrack["git rm --cached if Git is already tracking it"]
    Commit["Commit the repository change"]
    Push["Push the cleaned current version"]

    Remove --> Ignore --> Untrack --> Commit --> Push
```


### Step 3 — Consider the Git history

The old credential may still exist inside earlier commits.

If the repository was exposed or the credential is particularly sensitive, the
history may need to be rewritten using an appropriate Git history-cleaning tool
or the repository host's documented secret-removal process.

History rewriting is more disruptive because anybody with an existing clone may
need to synchronise with the rewritten history afterwards.

For that reason it should be done deliberately rather than as an automatic first
command.

Most importantly:

> Rewriting history does not replace rotating the secret.

Even a perfectly cleaned Git history cannot prove that nobody copied the
credential while it was available.


## Checking a Commit Before Pushing

The normal production Git checks are covered in
[Git Problems](../runbook/git-problems.md#checking-the-current-commit). From a security point of view, the
important addition is checking what is about to enter the repository before it is
pushed.

A small amount of checking before each push is considerably easier than cleaning
a leaked secret afterwards.

Useful commands are:

```bash
git status
git diff
git diff --staged
```

Before committing, look for files which do not seem like normal project source.

For example, pay particular attention to:

- `.env` files;
- `*.key`;
- `*.pem`;
- credential files;
- temporary exports;
- database dumps;
- SSH configuration.

The exact filename is less important than understanding what the file contains.


### Review staged content

A useful habit is:

```bash
git diff --staged
```

immediately before the commit.

That shows what is actually about to enter Git rather than everything which
happens to exist in the project directory.


## Docker and Secrets

Docker does not automatically make a secret safe.

For example, putting a password directly inside:

```dockerfile
ENV DATABASE_PASSWORD=...
```

and committing the Dockerfile would still expose it through Git.

Likewise, hard-coding a private value inside:

```yaml
environment:
  DATABASE_PASSWORD: actual-password
```

in a committed Compose file would expose the same credential.


### Build-time values need extra care

Values passed during a Docker build can sometimes become part of build layers or
generated application output.

This is especially important for React because `REACT_APP_*` values
intentionally become browser-visible JavaScript.

The current client configuration path is described in
[`REACT_APP_SERVER_URL`](environment-configuration.md#react_app_server_url).

A frontend build should therefore never be used as a secret-storage mechanism.


### Future private server configuration

If Madiao later needs real secrets, the deployment setup should be changed so the
server receives them without committing their values.

The exact solution can be chosen when that requirement exists.

The important architectural rule is simply:

```mermaid
flowchart TD
    Browser["Browser-visible configuration<br/>safe for the client to receive"]
    Private["Private server credential<br/>must remain server-side"]

    Browser ---|"These are not interchangeable"| Private
```


## Current Madiao Security Boundaries

At the moment Madiao's important security boundaries are fairly simple.

The browser is not trusted to make authoritative game decisions.

The wider public/private state split is documented in
[Public and Private Game State](server-runtime-state.md#public-and-private-game-state),
while the event flow which delivers that state to the client is covered in
[How Game State Reaches the Client](socketio-events.md#how-game-state-reaches-the-client).

The server validates:

- lobby actions;
- whose turn it is;
- card ownership;
- declarations;
- challenges;
- game phases.

It also keeps private card values on the server until they are legitimately
revealed.

This matters more to the current game than hiding public JavaScript or event
names.

A player can inspect or modify the React code running in their own browser, but
the server should remain authoritative:

```mermaid
flowchart TD
    Browser["Player-controlled browser<br/>can be inspected or modified"]
    Request["Socket.IO request"]
    Server["Authoritative server validation"]
    Accept{"Valid action?"}
    Apply["Apply the real game-state change"]
    Reject["Reject the request"]

    Browser --> Request --> Server --> Accept
    Accept -->|"Yes"| Apply
    Accept -->|"No"| Reject
```

They should therefore not be able to make the server accept a card they do not
own or see another player's private hand simply by changing the interface.


## Quick Repository Safety Reference

| Item | Store in Git? | Reason |
| --- | --- | --- |
| React/Node source | Yes | Project source |
| `package.json` | Yes | Dependency definition |
| `package-lock.json` | Yes | Reproducible dependency tree |
| Dockerfiles | Yes | Deployment definition |
| `docker-compose.yml` with non-secret config | Yes | Deployment definition |
| Documentation | Yes | Project documentation |
| Public server/client address | Usually yes | Not an authentication credential |
| `REACT_APP_SERVER_URL` | Treat as public | Delivered to browser |
| SSH public key | Can be shared | Does not grant access by itself |
| SSH private key | No | Authentication credential |
| Password | No | Authentication credential |
| GitHub/API token | No | Authentication/authorisation credential |
| Future database password | No | Private server credential |
| Local Python environment | No | Re-creatable local tooling |


## Chapter Summary

Most Madiao project files are perfectly appropriate to store in Git.

Source code, Docker configuration, package lockfiles, documentation and public
network addresses are all part of describing or rebuilding the application.

The important things to keep out are credentials which grant access, such as
SSH private keys, passwords, tokens, API secrets and future database
credentials.

The current React `REACT_APP_SERVER_URL` must always be treated as public
because it is compiled into JavaScript sent to the player's browser.

The current `CLIENT_ORIGIN` is also configuration rather than a credential.

`.gitignore` is useful for preventing local and private files from being added,
but it does not remove something which Git is already tracking and it does not
erase old Git history.

If a real secret is accidentally committed, the first response should be to
rotate or revoke that credential. Removing it from the current source and, where
necessary, cleaning the Git history comes afterwards.

Lastly, the main security boundary in the current game is the client/server
split itself.

Players are allowed to control and inspect their own browser, but the browser is
not trusted with authoritative game decisions or other players' private cards.
