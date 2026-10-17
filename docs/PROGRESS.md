# Progress — Lucid Labs LIMS

Last updated: 17 Oct 2026.

## Status by phase

| Phase | Status | Evidence |
|---|---|---|
| 0 Set-up, schema, seed | ✅ Done | 2 migrations applied to local PostgreSQL 18; seed creates 4 sections, 10 tests, 4 formulas, 10 equipment, 5 chemicals, admin + 13 demo users, 2 demo customers |
| 1 Auth, RBAC, masters, audit | ✅ Done | API test-suite; masters UI create/edit verified in browser; formula validation (syntax + undeclared variable) returns 400 |
| 2 Enquiry → quotation → PO → receipt | ✅ Done | API tests; UI walk-through: ENQ/2026-27/0001 → QTN/2026-27/0001 (HOD review, e-signed authorization, sent) → PO/SUN/4471 → SRN/2026-27/0001; quotation PDF inspected |
| 3 Registration & allocation | ✅ Done | UI: LL/2026-27/00001 (Pharma template) registered to Chemical + Mechanical, allocated to section analysts |
| 4 Analyst workbench & review | ✅ Done | UI: LOD formula result 0.23 % (Complies) with equipment + image upload; Brinell 3 replicates → mean 150.67 HBW; return-for-correction → resubmit → approve |
| 5 Reports | ✅ Done | UI: combined NABL report TR/2026-27/00001 previewed and released; PDF inspected (sections, replicates, conformity, e-signature) |
| 6 Dispatch, stores, invoice | ✅ Done | UI: INV/2026-27/0001 (advance ₹1,000, balance ₹1,360) authorized & issued; DSP/2026-27/0001 blocked until combined report verified, then delivered; remnant retained 6 months |
| 7 Dashboard, notifications, traceability, builds, deploy files | ✅ Done (Docker/CI unverified) | `npm run build` OK for API + web (33 routes); standalone web build OK; bundled API smoke-tested (health, login, invoice PDF, cross-origin POST → 403). Dockerfiles, compose and CI were **not run** — Docker is not installed on the development machine and the repo has no remote yet |
| 8 UAT, go-live | ⏳ Not started | Needs Lucid Labs: open questions (IMPLEMENTATION_PLAN.md), real lab data, SMTP, hosting |

## Automated tests (last run 17 Oct 2026)

- `packages/shared` — 13 unit tests: GST split (intra/inter), discount, LUT zero-rating, advance, round-off, amount in words, formula engine (precedence, functions, unsafe input, division by zero), specification parsing & conformity, role boundaries, status transitions. **13/13 pass.**
- `apps/api` — 16 integration tests against a real PostgreSQL test database covering the full workflow and §9 boundaries (CRM cannot approve; analyst cannot review own test; section scoping; method-change permission; preview-before-release; combined-report blocking; double billing; early disposal remark; audit and signature records). **16/16 pass.**
- `npm run typecheck` — shared, API and web: clean.
- `e2e/` — Playwright browser suite (`npm run test:e2e`, also in CI): the full workflow through the UI with ten role users (enquiry → quotation HOD review + signatory e-sign incl. wrong-password rejection → PO → receipt → Pharma pre-registration → register to two sections → allocate → LOD formula entry → return-for-correction → approve → combined report preview/release → invoice authorize/issue → dispatch with combined verification → stores retention) plus role-based navigation. **3/3 pass** (~3 min). It found and fixed a bug: a wrong e-signature password returned 401 and the web client signed the user out; re-entry failures now return code `BAD_PASSWORD` (still HTTP 401) and keep the dialog open.

## Known limitations / outstanding

- **E-mail is not delivered** until SMTP variables are set; messages wait in Admin → E-mail outbox as "Not configured".
- **Open business questions** (8) listed in IMPLEMENTATION_PLAN.md — defaults are in place and easy to change.
- **NABL mark** on reports is a text mark; the official logo image (and ULR number) need Lucid Labs' accreditation details.
- **File storage** is local disk; mount a persistent volume (compose does) or add an S3 driver before multi-server hosting.
- A report released before a PDF layout fix (TR/2026-27/00001 in the local dev database) keeps its original PDF by design (released PDFs are immutable).
- Lint (ESLint) is not configured.

## Local accounts (development database only)

- Administrator: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env`.
- Demo users (password `SEED_DEMO_PASSWORD`): crm@, hod@, regrev@, approver.chem@ (Chemical + Instrumental), approver.micro@, approver.mech@, analyst.chem@, analyst.inst@, analyst.micro@, analyst.mech@, stores@, accounts@, signatory@ — all `@lucidlabs.local`.
- Browser-test accounts (password `E2E_PASSWORD`): e2e.admin@, e2e.analyst.chem@, e2e.analyst.mech@ `lucidlabs.local` — created with `apps/api/scripts/ensure-user.ts`.

Set `SEED_DEMO_USERS=false` and use strong, unique passwords for any shared or production environment.
