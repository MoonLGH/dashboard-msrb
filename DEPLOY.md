# Deploy Dashboard

## GitHub Pages Frontend

1. Push the `dashboard` folder as its own Git repository.
2. Open repository settings.
3. Go to `Pages`.
4. Set `Source` to `GitHub Actions`.
5. Push to `main` or run the `Dashboard Pages` workflow manually.

The workflow publishes only:

```text
apps/remote-web
```

## Vercel API

Create a Vercel project from the dashboard GitHub repo and set:

```text
Root Directory: apps/remote-api
Framework Preset: Other
Build Command: leave empty
Output Directory: leave empty
Install Command: leave empty
```

Add environment variables:

```text
DASHBOARD_USER_TOKEN=your-remote-dashboard-token
DASHBOARD_HOSTER_TOKEN=your-hoster-agent-token
```

The Vercel deployment URL becomes the `API Base` in the remote frontend and `DASHBOARD_API_BASE` in `dashboard/apps/host-agent/.env`.

## Hoster Agent

On the hoster computer:

```text
dashboard/apps/host-agent/.env
```

```text
DASHBOARD_API_BASE=https://your-vercel-project.vercel.app
DASHBOARD_HOSTER_ID=hoster-main
DASHBOARD_HOSTER_TOKEN=your-hoster-agent-token
PERFECTBOT_LOCAL_DESK=http://127.0.0.1:4784
DASHBOARD_POLL_MS=900
```

Then test:

```powershell
cd C:\theperfectbot\v4
npm run desk
```

```powershell
cd C:\theperfectbot\v4\dashboard
npm run agent
```

Install Windows startup after the test passes:

```powershell
cd C:\theperfectbot\v4\dashboard
npm run startup:install
```
