# PoE Tracker Operations

This page contains the commands and procedures used during normal operation of the PoE Tracker production deployment.

The project runs as a Docker Compose stack on the production server. The main services are PostgreSQL, the Python fetcher and Grafana. pgAdmin is kept as an optional administration tool and is only started when it is needed.


## Project Location

The production copy of the project is stored in:

```bash
cd ~/poe-tracker
```

Most Docker Compose commands on this page assume they are being run from this directory.


## Starting the Stack

Start the main services in detached mode:

```bash
docker compose up -d
```

Detached mode is important on the production server because the containers need to continue running after the SSH session is closed.

The local computer used to connect to the server does not need to remain online. Once started, Docker continues running the tracker directly on the VPS.


## Checking Service Status

To check the state of the running containers:

```bash
docker compose ps
```

The main services should normally include:

```text
poe-tracker-postgres
poe-tracker-fetcher
poe-tracker-grafana
```

PostgreSQL should report as healthy once its health check has completed.

The fetcher and other long-running production services use Docker restart policies so they can recover from container or Docker daemon restarts without requiring an active SSH session.


## Stopping the Stack

Stop and remove the running containers:

```bash
docker compose down
```

This does not remove the persistent Docker volumes.

Stored PostgreSQL data and Grafana state therefore remain available the next time the stack is started.


## Updating the Production Deployment

Before pulling changes, check whether anything has been edited directly on the server:

```bash
git status
```

Pull the latest version from GitHub:

```bash
git pull
```

For a normal application update, rebuild the required images and recreate any containers which have changed:

```bash
docker compose up -d --build
```

Then confirm that the services started correctly:

```bash
docker compose ps
```

The normal update procedure is:

```bash
cd ~/poe-tracker
git status
git pull
docker compose up -d --build
docker compose ps
```

`docker compose restart` should not be used to deploy new application code. Restart only stops and starts the existing containers and does not replace them with containers created from newly built images.


## Updating a Single Service

If a change only affects one service, it can be rebuilt individually.

For example, to rebuild the fetcher:

```bash
docker compose up -d --build fetcher
```

This leaves PostgreSQL and Grafana running while the fetcher is replaced.


## Environment Configuration

Production credentials and environment-specific settings are stored in the local `.env` file.

The real `.env` file is intentionally excluded from Git and is therefore not updated by:

```bash
git pull
```

The repository contains `.env.example` to document the expected variables.

After changing `.env`, the resolved Compose configuration can be checked with:

```bash
docker compose config
```

This is useful for detecting missing variables before recreating the containers.

The tracker currently uses environment settings for database connectivity, configured games and the fetch interval.


## Viewing Logs

View logs from the complete stack:

```bash
docker compose logs
```

Follow logs continuously:

```bash
docker compose logs -f
```

View only the most recent fetcher output:

```bash
docker compose logs fetcher --tail=100
```

View fetcher activity from a recent period:

```bash
docker compose logs fetcher --since 2h
```

The fetcher logs are the first place to check when new currency snapshots do not appear in PostgreSQL or Grafana.


## Manually Triggering a Currency Fetch

The fetcher normally performs an initial pull when it starts and then continues according to the configured interval.

A fetch for all configured games can also be triggered manually:

```bash
docker compose exec fetcher \
python -c "from poe_fetcher import fetch_all_games; fetch_all_games()"
```

This is useful after configuration changes or when testing API and database connectivity without restarting the fetcher container.


## Checking Collected Data

Open an interactive PostgreSQL session:

```bash
docker compose exec db sh -c \
'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

To check the latest stored snapshot for each game without entering the interactive shell:

```bash
docker compose exec db sh -c \
'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT
    game,
    MAX(fetched_at) AS latest_fetch
FROM poe_currency_history
GROUP BY game
ORDER BY game;
"'
```

This is also useful for confirming that scheduled collection continued while no SSH session or local computer was connected.

To check the number of stored rows for each game:

```bash
docker compose exec db sh -c \
'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT
    game,
    COUNT(*) AS rows
FROM poe_currency_history
GROUP BY game
ORDER BY game;
"'
```


## Checking the Database Schema

The current table definition can be inspected with:

```bash
docker compose exec db sh -c \
'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
-c "\d poe_currency_history"'
```

The production schema stores:

```text
id
game
league_id
league_name
currency_id
currency_name
primary_value
primary_currency
fetched_at
```

Schema resets and destructive recovery procedures are covered separately in the troubleshooting documentation.


## Starting pgAdmin

pgAdmin is an optional administration tool and is not started as part of the normal production stack.

Start services in the `tools` profile with:

```bash
docker compose --profile tools up -d
```

pgAdmin is bound to localhost on the VPS rather than exposed publicly.

!!! note
    `pgadmin/servers.json` contains the PostgreSQL username and database name
    used by the preconfigured pgAdmin connection.

    If `DB_USER` is changed in `.env`, update the `Username` value in
    `pgadmin/servers.json` to match.

    If `DB_NAME` is changed in `.env`, update the `MaintenanceDB` value in
    `pgadmin/servers.json` to match.


## Connecting to pgAdmin

From the local computer, create an SSH tunnel to the server:

```bash
ssh -L 5050:127.0.0.1:5050 gears@178.105.59.4
```

While that SSH session remains open, access pgAdmin locally at:

```text
http://localhost:5050
```

The PostgreSQL server itself remains inside the Docker network and does not need a public host port.


## Grafana

Grafana runs inside Docker but is not exposed directly to the internet through its container port.

The production nginx configuration proxies the `/poe/` path to Grafana:

```text
https://178.105.59.4/poe/
```

HTTPS termination is handled by nginx on the host.

The Grafana PostgreSQL datasource and dashboard are provisioned from files stored in the repository. The exported dashboard JSON is kept under the Grafana dashboard directory so that a fresh deployment can recreate the dashboard without rebuilding it manually.


## Saving Dashboard Changes

Changes made through the Grafana editor should be saved inside Grafana first.

Once the dashboard is complete, export its JSON and replace the corresponding dashboard file in the repository.

The updated JSON should then be committed and pushed to GitHub.

This is important because a dashboard which only exists in Grafana's local state can be lost if the Grafana volume is removed or the project is deployed from a clean environment.


## Restarting a Service

If no source code, image or Compose configuration has changed and a service only needs to be restarted:

```bash
docker compose restart fetcher
```

The same command can be used for another service by replacing `fetcher` with its Compose service name.

For application updates, use:

```bash
docker compose up -d --build
```

instead.


## Verifying a Deployment

After an update or restart, a basic production check consists of:

```bash
docker compose ps
docker compose logs fetcher --tail=100
```

The Grafana dashboard can then be opened through the `/poe/` HTTPS route.

For a stronger check, confirm that PostgreSQL contains a recent `fetched_at` timestamp for each configured game.
