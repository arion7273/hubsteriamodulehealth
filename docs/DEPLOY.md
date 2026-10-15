# Deploy so scans actually run

The React UI can live on Vercel, but **Playwright always runs on a Node host**. Pick one path:

## Path A — Single host (recommended)

One deployment serves UI + API + Playwright.

### Railway

1. [railway.app](https://railway.app) → **New project** → **Deploy from GitHub** → this repo.
2. Railway detects `railway.toml` and builds the `Dockerfile`.
3. Open the generated URL (e.g. `https://….up.railway.app`) — run scans from the landing page.

No Vercel required.

### Render

1. **New** → **Blueprint** → connect repo (`render.yaml` included), or **Web Service** → Docker → `Dockerfile`.
2. Use the service URL as your app entry point.

### Local (dev)

```bash
npm install
npx playwright install chromium
npm run start:prod
```

Open http://localhost:4177

---

## Path B — Vercel UI + scanner API

1. Deploy **Path A** on Railway/Render and copy the **HTTPS origin** (no path), e.g. `https://hubsteria-health.up.railway.app`.
2. In the **Vercel** project (Root Directory = `web`):
   - **Settings → Environment Variables**
   - `SCANNER_API_ORIGIN` = that origin (all environments)
3. **Redeploy** the Vercel project.

`web/middleware.js` proxies `/api`, `/evidence`, and `/fixtures` to the scanner so the browser stays same-origin.

Optional: set `CORS_ORIGINS` on the scanner to your Vercel URL if you also use `VITE_API_BASE` direct calls.

### Alternative: `VITE_API_BASE`

Set at **build** time on Vercel to the scanner origin instead of using `SCANNER_API_ORIGIN`. Requires rebuild when the API URL changes.

---

## Environment reference

| Variable | Where | Purpose |
|----------|--------|---------|
| `SCANNER_API_ORIGIN` | Vercel | Edge proxy to scanner (Path B) |
| `VITE_API_BASE` | Vercel build | Client calls API directly (CORS) |
| `CORS_ORIGINS` | Scanner | Comma-separated UI origins |
| `HOST` | Scanner | `0.0.0.0` in production (Docker sets this) |
| `PORT` | Scanner | Default `4177`; platforms inject their own |
| `AI_GATEWAY_API_KEY` or `VERCEL_AI_API_KEY` | Scanner (Node) | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) for report AI analysis (optional) |
| `AI_GATEWAY_MODEL` | Scanner | Default `openai/gpt-4o-mini` |

**Local:** copy `.env.example` → `.env`, set `AI_GATEWAY_API_KEY`, restart `npm start`. Never commit `.env`.

**Railway/Render:** add the same variables in the service dashboard (not Vercel unless AI runs there — scans + AI should live on the Node host).

`GET /api/ai/status` reports whether the gateway key is configured.

---

## Health check

Scanner: `GET /api/health` → `{ "ok": true, "service": "hubsteriamodulehealth" }`

If Vercel shows the yellow banner, `/api/health` on the Vercel domain is failing — fix `SCANNER_API_ORIGIN` or deploy Path A.
