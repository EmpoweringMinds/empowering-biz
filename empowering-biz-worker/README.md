# Empowering Biz Worker (local setup, Step 1)

This is a dedicated Worker for Empowering Biz. It is intentionally separate from `empowering-minds-api` and its workshop D1 database. At this stage it only provides health and read-only service catalogue endpoints. It does not create orders, call Razorpay, send emails, or deploy itself.

## Prerequisites

- Node.js LTS and npm
- A Cloudflare account is not required for local-only testing, but is required when you later create a remote D1 database or deploy.

## 1. Install dependencies

```bash
npm install
```

## 2. Apply migrations to local D1 only

```bash
npm run db:migrate:local
```

This creates the local schema and imports the 62 service rows. It does not modify Supabase or a remote Cloudflare database.

## 3. Start the Worker locally

```bash
npm run dev
```

Wrangler normally serves it at `http://localhost:8787`.

## 4. Test endpoints in another terminal

```bash
curl http://localhost:8787/api/health
curl http://localhost:8787/api/services
curl http://localhost:8787/api/services/startup-mentoring
```

Expected checks:

- `/api/health` returns `ok: true` and `database: "connected"`.
- `/api/services` returns `count: 62` and a `services` array.
- The four reclassified services return `price_type: "fixed"`.
- `checkout_eligible` is true only for active, fixed-price services with a price and purchase type `cart`, `month`, or `session`.

## When moving to Cloudflare later

1. Run `npx wrangler login`.
2. Create a new D1 database using `npx wrangler d1 create empowering-biz-db`.
3. Copy the returned `database_id` into `wrangler.jsonc`, replacing `REPLACE_WITH_DEDICATED_D1_DATABASE_ID`.
4. Only after confirming the database name and ID, run `npm run db:migrate:remote`.
5. Deploy only after local tests pass and we explicitly move to that step.

Do not point this config at `empowering-minds-db`. Do not put API secrets in `wrangler.jsonc`; use Wrangler secrets when those integrations are implemented.

## Current endpoints

- `GET /api/health` — verifies the Worker can query D1.
- `GET /api/services` — returns active services.
- `GET /api/services/:slug` — returns one active service.

Prices are returned as `price` in rupees for convenient display and `price_paise` as the exact integer representation. Client-side eligibility is only a UI hint; checkout validation will be enforced server-side in a later step.
