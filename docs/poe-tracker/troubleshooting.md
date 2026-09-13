# PoE Tracker Troubleshooting and Recovery

This page records the main problems encountered while developing and operating the PoE Tracker, together with the checks and recovery steps used to resolve them.

The aim is not to document every possible Docker, PostgreSQL or Grafana issue. It focuses on problems which have actually occurred in this project and on the procedures most likely to be useful again later.


## Start With the Basics

Before changing anything, check the current state of the stack:

```bash
cd ~/poe-tracker
docker compose ps
```

Then check the fetcher logs:

```bash
docker compose logs fetcher --tail=100
```

If the problem started after a repository update, also check:

```bash
git status
git log -1 --oneline
```

This helps confirm that the expected version of the project is actually present on the server.


## Repository Updated but Container Still Uses Old Code

### Symptoms

The files on the server contain the latest code, but the running application behaves as if an older version is still deployed.

Examples encountered during development included:

- a function still using an old signature
- the fetcher continuing to run an older parser after `git pull`
- changes being visible in the repository but not inside the running container

### Cause

The source files were updated on the host, but the Docker image was not rebuilt.

Running:

```bash
git pull
docker compose restart fetcher
```

only restarts the existing container. It does not build a new image from the updated files.

### Resolution

Rebuild and recreate the affected service:

```bash
docker compose up -d --build fetcher
```

For a full application update:

```bash
docker compose up -d --build
```

If there is still uncertainty about cached build layers, a no-cache rebuild can be used as a troubleshooting step:

```bash
docker compose build --no-cache fetcher
docker compose up -d --force-recreate fetcher
```

A no-cache build is normally unnecessary for routine deployments.


## Checking Which Source File the Container Is Running

When stale code is suspected, compare the host file with the copy inside the container.

For example:

```bash
grep -n "def fetch_and_store_currency" poe_fetcher.py
```

Then:

```bash
docker compose exec fetcher grep -n "def fetch_and_store_currency" /app/poe_fetcher.py
```

If the two versions differ, rebuild the fetcher image.


## Database Schema Does Not Match the Current Code

### Symptoms

The fetcher reaches PostgreSQL but fails during an insert with an error similar to:

```text
psycopg2.errors.UndefinedColumn:
column "game" of relation "poe_currency_history" does not exist
```

### Cause

The application schema changed, but the existing PostgreSQL table was created using an older version.

The project uses:

```sql
CREATE TABLE IF NOT EXISTS ...
```

This creates a missing table, but it does not modify or migrate an existing one.

For example, adding columns such as:

```text
game
league_id
league_name
primary_currency
```

to the Python schema definition does not automatically add them to a table which already exists.

### Check the Current Schema

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d poe_currency_history"'
```

The current table should contain:

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


## Recreating the Currency History Table

!!! danger
    The following procedure permanently removes all stored currency history from
    `poe_currency_history`. Only use it when the existing data can be discarded.

Drop the old table:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP TABLE IF EXISTS poe_currency_history;"'
```

Recreate it using the current application schema:

```bash
docker compose exec fetcher python -c "from poe_database import create_table_if_not_exists; create_table_if_not_exists()"
```

Then verify:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d poe_currency_history"'
```

Finally, trigger a fresh fetch:

```bash
docker compose exec fetcher python -c "from poe_fetcher import fetch_all_games; fetch_all_games()"
```


## Manual Fetch Fails Because the Table Does Not Exist

### Symptoms

A manual fetch returns an error similar to:

```text
psycopg2.errors.UndefinedTable:
relation "poe_currency_history" does not exist
```

### Cause

The manual command directly called:

```python
fetch_all_games()
```

but did not run the schema creation step normally executed by `main.py` during application startup.

This can happen after manually dropping the table.

### Resolution

Create the table first:

```bash
docker compose exec fetcher python -c "from poe_database import create_table_if_not_exists; create_table_if_not_exists()"
```

Then run the fetch:

```bash
docker compose exec fetcher python -c "from poe_fetcher import fetch_all_games; fetch_all_games()"
```


## API Request Succeeds but Only a Few Currencies Are Stored

### Symptoms

The fetcher reports successful API requests but inserts only a very small number of rows, for example:

```text
Successfully inserted 2 poe1 currencies
Successfully inserted 3 poe2 currencies
```

No SQL or HTTP error is shown.

### Cause

The poe.ninja exchange response contains price lines identified by currency ID.

The original parser built its currency-name lookup only from:

```python
core["items"]
```

This contained metadata for the small set of reference currencies rather than every traded line.

Currencies whose IDs were not present in that lookup received no name and were silently skipped by logic similar to:

```python
if currency_id and name and value is not None:
```

The result was a successful fetch followed by most of the response being discarded during parsing.

### Resolution

The parser was changed to build the metadata lookup from all available item metadata rather than relying only on `core.items`.

Diagnostic logging was also added so the fetcher can report how many currencies were inserted and how many were skipped because metadata was unavailable.

If this problem appears again, compare:

```text
number of currencies inserted
number of currencies skipped because metadata was unavailable
```

A large difference between these values is a parser problem rather than a PostgreSQL connection problem.


## Environment Variables Missing After a Git Update

### Symptoms

Docker Compose prints warnings such as:

```text
The "POE_GAMES" variable is not set. Defaulting to a blank string.
The "FETCH_INTERVAL_MINUTES" variable is not set. Defaulting to a blank string.
```

### Cause

The production `.env` file is deliberately excluded from Git.

Updating `.env.example` in the repository does not automatically update the real `.env` file on the server.

Docker Compose also parses the complete Compose file even when starting only an optional profile or individual service, so missing variables can appear while working with an unrelated container.

### Resolution

Compare the production `.env` with `.env.example` and add any newly required variables.

Then verify the resolved configuration:

```bash
docker compose config
```

Do not commit the real `.env` file or production credentials to Git.


## PostgreSQL Password Changed but Authentication Still Fails

### Symptoms

The password in `.env` has been changed, but PostgreSQL continues to reject the new credentials.

### Cause

PostgreSQL initialization variables are applied when the database volume is first created.

Changing:

```text
DB_USER
DB_PASSWORD
DB_NAME
```

in `.env` does not reinitialize an existing PostgreSQL data directory.

The old credentials can therefore remain active inside the existing volume.

### Recovery

If the stored data must be preserved, change the PostgreSQL user's password from inside the database rather than deleting the volume.

If the environment is disposable, a clean volume reset is simpler.

!!! danger
    The following command removes persistent volumes belonging to this Compose
    project. This includes stored PostgreSQL history and may also remove local
    Grafana or pgAdmin state.

```bash
docker compose --profile tools down -v --remove-orphans
```

Then rebuild and start the stack again:

```bash
docker compose up -d --build
```

Use this only when the stored data is known to be disposable.


## Grafana Loads but Panels Show Errors or No Data

### Check PostgreSQL First

Confirm that data exists:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT
    game,
    COUNT(*) AS rows,
    MAX(fetched_at) AS latest_fetch
FROM poe_currency_history
GROUP BY game
ORDER BY game;
"'
```

If PostgreSQL contains recent data, the problem is likely in the Grafana query or datasource configuration rather than the fetcher.

### Common Causes

Dashboard queries may still reference fields from an older schema, such as:

```text
chaos_value
```

instead of:

```text
primary_value
```

Queries can also fail if they do not include the current dashboard variables for:

```text
game
league
currency
```

The provisioned datasource should use the expected PostgreSQL datasource UID configured in the repository.


## Grafana Dashboard Disappears After a Clean Deployment

### Cause

A dashboard created or modified only through the Grafana UI can exist solely in Grafana's local database.

If the Grafana volume is removed, that local copy is lost.

### Prevention

After completing dashboard changes:

1. Save the dashboard in Grafana.
2. Export the dashboard JSON.
3. Replace the dashboard JSON stored in the repository.
4. Commit and push the updated file.

The repository copy is then used by Grafana provisioning during a fresh deployment.

The exported dashboard is stored in the project's Grafana dashboard directory.


## Grafana Does Not Load Through `/poe/`

The production setup does not expose Grafana directly to the public internet.

Grafana is bound locally on the VPS and nginx proxies:

```text
https://178.105.59.4/poe/
```

to the local Grafana service.

### Check the Grafana Container

```bash
docker compose ps
```

Then inspect Grafana logs if required:

```bash
docker compose logs grafana --tail=100
```

### Check the Local Upstream

From the VPS:

```bash
curl -I http://127.0.0.1:4000
```

If the local request works but `/poe/` does not, the problem is likely in the host nginx configuration rather than the Grafana container.

The Grafana container is configured to serve correctly from the `/poe/` subpath.


## pgAdmin Does Not Automatically Show PostgreSQL

### Cause

Being on the same Docker network allows pgAdmin to reach PostgreSQL, but it does not automatically create a saved server entry in the pgAdmin interface.

The project provisions the server definition separately.

If the registration is missing, check the pgAdmin provisioning file and the volume mounts in `compose.yaml`.

pgAdmin remains optional and should not be exposed publicly.


## Checking Whether Scheduled Fetching Is Still Running

The fetcher should continue operating even when the local computer is turned off and no SSH session is active.

Check recent logs:

```bash
docker compose logs fetcher --since 2h
```

Then check the latest timestamps stored in PostgreSQL:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT
    game,
    MAX(fetched_at) AS latest_fetch
FROM poe_currency_history
GROUP BY game
ORDER BY game;
"'
```

If the timestamps continue advancing while no SSH session is open, scheduled collection is working correctly.

Also check that the production services are running:

```bash
docker compose ps
```

and that the intended restart policy is active:

```bash
docker inspect -f '{{.Name}} -> {{.HostConfig.RestartPolicy.Name}}' poe-tracker-postgres poe-tracker-fetcher poe-tracker-grafana
```


## Clean Redeployment

A complete clean redeployment is useful when the stored data is disposable and several parts of the deployment may be stale at the same time.

It is also useful as a final reproducibility test.

!!! danger
    This procedure removes the PoE Tracker containers and persistent volumes.
    Historical PostgreSQL data and local Grafana state will be lost.

From the project directory:

```bash
docker compose --profile tools down -v --remove-orphans
```

Move out of the directory and remove the old project copy:

```bash
cd ~
rm -rf poe-tracker
```

Clone the repository again:

```bash
git clone git@github.com:Gearsik/poe-tracker.git
cd poe-tracker
```

Recreate the production `.env` file using `.env.example` as the reference.

Check the resolved Compose configuration:

```bash
docker compose config
```

Build and start the stack:

```bash
docker compose up -d --build
```

Then verify:

```bash
docker compose ps
docker compose logs fetcher --tail=100
```

Finally, confirm that the current database schema and fresh data have been created.

A successful clean deployment demonstrates that the repository contains everything needed to rebuild the application apart from intentionally excluded environment-specific secrets.


## When to Use `restart`, `up`, or `up --build`

Use:

```bash
docker compose restart fetcher
```

when the existing container only needs to be restarted and no code, image or configuration has changed.

Use:

```bash
docker compose up -d
```

when Compose configuration has changed but no custom image rebuild is required.

Use:

```bash
docker compose up -d --build
```

after application source code, dependencies or Docker build inputs have changed.

For normal repository updates, `up -d --build` is the safest standard deployment command.
