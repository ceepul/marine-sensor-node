# Marine Sensor dashboard

The web side of the sensor node. It receives the batches `sensor/uploader.py` posts, stores them, and shows:

- **Dashboard**: Pi (node) and sensor status, current temperature / humidity / dew point, history charts (1 h to 30 d) and a live log of readings and events.
- **Condensation**: the container's dew point against the local weather forecast, with a warning banner when condensation is likely.

Next.js 16 (App Router, Cache Components), SQLite via libSQL, Recharts, weather from [Open-Meteo](https://open-meteo.com/) (free, no API key).

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm run simulate     # optional: a fake node that sends 24 h of history, then a reading every 5 s
npm test
```

Data is stored in `data/sensor.db` with no setup. Without `INGEST_TOKEN` set, local dev accepts uploads unauthenticated.

`npm run simulate -- --dew-point 12` simulates a damp container to trigger the condensation warning. See the top of `scripts/simulate.mjs` for other options.

## Connect the Raspberry Pi

The uploader already speaks this API, so no code changes are needed on the Pi. Set `/etc/sensor/uploader.env`:

```ini
INGEST_URL=https://<your-site>/api/ingest
INGEST_TOKEN=<same value as INGEST_TOKEN on the server>
DEVICE_ID=marine-node-01
```

Then `sudo systemctl restart sensor-uploader`. Readings appear within a minute.

The node's location (used for the forecast, and the time zone everything is shown in) is looked up by `DEVICE_ID` in [`config/sites.ts`](config/sites.ts). Set `DEFAULT_SITE` to where the node is installed.

## Configuration

| Variable              | Purpose                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `INGEST_TOKEN`        | Shared secret the node sends as `Authorization: Bearer …`. Required in production (uploads are refused without it). |
| `DATABASE_TURSO_DATABASE_URL` | Hosted Turso database URL. Unset locally, which uses `data/sensor.db`. |
| `DATABASE_TURSO_AUTH_TOKEN`   | Token for the hosted database.                                         |

See [`.env.example`](.env.example).

## Deploy (Vercel + Turso, both free tiers)

1. Import the repo into Vercel with **Root Directory** set to `web`, and add `INGEST_TOKEN`.
2. Add the **Turso** integration to the project with the env prefix `DATABASE`; it sets `DATABASE_TURSO_DATABASE_URL` and `DATABASE_TURSO_AUTH_TOKEN`.
3. Point the Pi at `https://<project>.vercel.app/api/ingest`.

Tables are created automatically on first use. Any Node host with a persistent disk can skip Turso and keep the default SQLite file.

## API

| Endpoint                                        | Returns                                                       |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `POST /api/ingest`                              | Accepts uploader batches: `{device_id, readings[], events[]}` |
| `GET /api/devices`                              | Every node that has reported, with its connection status     |
| `GET /api/devices/:id/summary`                  | Status, latest reading, deltas, sparklines, log               |
| `GET /api/devices/:id/history?range=24h`        | Averaged series for `1h`, `6h`, `24h`, `7d` or `30d`          |
| `GET /api/devices/:id/condensation`             | Weather, container dew point and the risk assessment          |

The dashboard polls the summary every 3 s with `?after=<reading id>.<event id>`, which returns only log lines newer than that cursor plus the current status, a handful of rows. The deltas, sparklines and hourly count come back only on `&stats=1`, which the browser adds once a minute.

Charts never read raw readings. As each synced reading is stored, a trigger adds it to pre-averaged 30 s and 15 min buckets (the `rollups` table, see [`lib/schema.ts`](lib/schema.ts)). 1H and 6H read the 30 s buckets; 24H, 7D and 30D read the 15 min ones. Each range combines them into 96 to 168 points, reading at most about 2,900 rows (30D). Readings stored before the rollups existed are backfilled once, by a migration that runs on first connect.

Ingest is idempotent: a retried batch is ignored, because rows are keyed on the node's row id plus timestamp. Malformed rows are skipped and counted rather than failing the batch, since the uploader retries a rejected batch forever.

## How status and risk are decided

- **Node**: online if it uploaded in the last 30 seconds (the uploader posts every 5 s, and at least every 10 s as a heartbeat); otherwise offline. The server logs "back online after …" when a node returns.
- **Sensor**: the logger records a state change whenever it happens (`ok`, `port_missing`, `sensor_silent`); the latest one sets the status, and readings stopping while the node is online shows as stalled.
- **Clock**: readings taken before the Pi's clock synced (`clock_ok = 0`) appear in the log but are left off charts, since their timestamps can't be trusted.
- **Condensation**: the container is sealed, so the moisture inside is fixed and its dew point stays roughly constant. The walls follow the outside air, so condensation forms when the outside temperature reaches the inside dew point. Risk is **high** if the forecast reaches the dew point within 48 h, and **elevated** if it comes within 3 °C (a margin for forecast error, radiative cooling on clear nights and sensor tolerance). The forecast is fetched from Open-Meteo at most every 30 minutes and cached in the database.
