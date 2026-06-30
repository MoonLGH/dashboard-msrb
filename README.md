# PerfectBot Dashboard

Remote dashboard layer for the existing local PerfectBot Desk.

This monorepo keeps the current local desk working and adds a cloud bridge:

```text
Remote browser -> GitHub Pages static web -> Vercel API live mailbox -> host agent -> local desk backend
```

The computer hoster never needs an open inbound port. `apps/host-agent` connects outward to the API, receives allowed jobs, calls the local desk API at `http://127.0.0.1:4784`, writes the durable snapshot to `.desk/remote-dashboard.json`, and sends the latest snapshot to Vercel for the remote frontend to pull.

There is no Redis/database dependency. Vercel only holds a temporary live mailbox and the latest pushed snapshot in function memory. The durable copy is the JSON file on the hoster computer.

## Packages

- `apps/remote-web`: static frontend for GitHub Pages.
- `apps/remote-api`: Vercel Functions API used as a temporary live mailbox.
- `apps/host-agent`: Node.js bridge that runs on the bot hoster computer.
- `packages/shared`: shared action names and defaults.

## Environment

Copy `apps/host-agent/.env.example` to `apps/host-agent/.env` or set these env vars in your shell:

```text
DASHBOARD_API_BASE=https://your-vercel-app.vercel.app
DASHBOARD_HOSTER_ID=hoster-main
DASHBOARD_HOSTER_TOKEN=change-me-hoster-token
PERFECTBOT_LOCAL_DESK=http://127.0.0.1:4784
```

Set these in Vercel for `apps/remote-api`:

```text
DASHBOARD_USER_TOKEN=change-me-user-token
DASHBOARD_HOSTER_TOKEN=change-me-hoster-token
```

No database env vars are required.

## Hoster JSON

The host agent writes:

```text
.desk/remote-dashboard.json
```

That file contains:

- latest local desk state
- latest system telemetry
- last local error
- recent remote job history
- agent metadata

The remote frontend reads that snapshot through:

```text
GET /api/snapshot?hosterId=hoster-main
```

The endpoint returns the latest snapshot that the hoster pushed. If Vercel memory resets, the hoster will republish the JSON on the next heartbeat.

## Run Locally

Start the existing local desk first:

```powershell
npm run desk
```

Then run the host agent:

```powershell
cd dashboard
npm run agent
```

## Windows Startup

Install the startup task from this folder:

```powershell
cd dashboard
npm run startup:install
```

This creates a Windows Task Scheduler task named `PerfectBot Dashboard Host`. At Windows logon it starts:

- the existing local desk with `npm run desk`
- the dashboard host agent with `npm run agent`

Logs are written to:

```text
.desk/logs/desk-startup.log
.desk/logs/dashboard-agent-startup.log
```

Remove it with:

```powershell
cd dashboard
npm run startup:uninstall
```

If Task Scheduler install is blocked by permissions, install the per-user hidden startup launcher instead:

```powershell
cd dashboard
npm run startup:user:install
```

Remove it with:

```powershell
cd dashboard
npm run startup:user:uninstall
```

For the web app, open `apps/remote-web/index.html` directly or serve it:

```powershell
cd dashboard
npm run web:serve
```

For a no-deploy local API test, use:

```powershell
cd dashboard
npm run api:local
```

The local API listens on `http://127.0.0.1:3000` and defaults to these tokens unless you override them in `apps/remote-api/.env.local`:

```text
DASHBOARD_USER_TOKEN=local-user-token
DASHBOARD_HOSTER_TOKEN=local-hoster-token
```

## Supported Remote Actions

The bridge intentionally allowlists actions:

- `STATE_GET`
- `SYSTEM_GET`
- `BOT_RUN_ALL`
- `BOT_RUN_ACCOUNT`
- `BOT_STOP`
- `CLUSTERS_SET`
- `CONFIG_GET`
- `CONFIG_SAVE`
- `ACCOUNT_ADD`
- `ACCOUNT_UPDATE`
- `ACCOUNT_DELETE`

Configurator support is preserved through `CONFIG_GET` and `CONFIG_SAVE`, which forward to the existing local desk `/api/state` and `/api/config` endpoints.

Remote state refresh uses the hoster JSON snapshot instead of creating a command job.
