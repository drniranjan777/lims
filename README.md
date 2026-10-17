# Lucid Labs LIMS

Laboratory Information Management System for Lucid Labs, built from the client-approved workflow (`docs/source/`). It covers the whole cycle: CRM enquiry → quotation → PO & sample receipt → registration → section allocation → analyst testing → review → reports → dispatch → sample retention/disposal → tax invoice.

**Stack:** Next.js 15 + React 19 (web) · Node.js + Express 5 + Prisma (API) · PostgreSQL.

| Document | Contents |
|---|---|
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Phases, decisions, open questions for Lucid Labs |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, security model, approval boundaries |
| [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Tables, traceability chain, numbering |
| [docs/PROGRESS.md](docs/PROGRESS.md) | What is done and verified, what is outstanding |

## Local development

Prerequisites: Node.js ≥ 20, PostgreSQL ≥ 14.

1. Install dependencies (npm ≥ 11 asks to approve Prisma/esbuild install scripts; they are pre-approved in `package.json`):

   ```bash
   npm install
   ```

2. Create `.env` from `.env.example` and fill in `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET`, `SEED_ADMIN_PASSWORD`. On Windows with PostgreSQL installed you can run a project-only database on port 5433 instead of using the system one:

   ```bash
   bash scripts/local-db.sh init
   ```

3. Apply migrations and seed:

   ```bash
   npm run db:deploy
   ```

   ```bash
   npm run db:seed
   ```

4. Run the API (port 4000) and the web app (port 3000) in two terminals:

   ```bash
   npm run dev:api
   ```

   ```bash
   npm run dev:web
   ```

   Open http://localhost:3000 and sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

## Tests & builds

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

`npm test` runs the shared unit tests and the API integration suite. The suite **wipes `TEST_DATABASE_URL`** before it runs and refuses to start if it equals `DATABASE_URL`.

## Deployment

`docker-compose.yml` runs PostgreSQL, the API (applies migrations with `prisma migrate deploy` on start) and the web app. Provide `POSTGRES_USER`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `WEB_ORIGIN` and optional SMTP settings in a `.env` next to it, and put an HTTPS reverse proxy in front of port 3000.

```bash
docker compose up -d --build
```

Then create the first administrator inside the API container:

```bash
docker compose exec -e SEED_ADMIN_EMAIL=admin@yourlab.in -e SEED_ADMIN_PASSWORD=change-me-now api npx tsx prisma/seed.ts
```

Back up the `pgdata` and `storage` volumes daily (database + uploaded files and released report PDFs).
