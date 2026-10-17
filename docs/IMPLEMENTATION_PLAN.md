# Implementation plan — Lucid Labs LIMS

Stack: Node.js (Express 5 + Prisma) · Next.js 15 / React 19 · PostgreSQL. Each phase is independently verifiable; verification evidence is recorded in `PROGRESS.md`.

| Phase | Scope (client document §) | Verification |
|---|---|---|
| 0 | Repo set-up, monorepo, shared package, schema, migrations, seed, docs | Migrations apply; seed runs |
| 1 | Auth (sessions, lockout, password change), RBAC + section scoping, users, master data (sections, tests, formulas, equipment, chemicals, customers), lab settings, audit trail, numbering, storage, notifications | API tests: auth, permissions, audit rows |
| 2 | §4.1 CRM enquiry · §4.2 quotation (GST, discount, terms, HOD review, e-signed authorization, send, decision, expiry, PDF) · §4.3 PO & sample receipt | API workflow test + UI walk-through |
| 3 | §4.4 pre-registration (Pharma/Mech/OM/Gen templates, tests copied from quotation, method-change boundary), registration approval to one or many sections, customer notification · §4.5 section receipt & analyst allocation | API workflow test + UI walk-through |
| 4 | §4.6 analyst workbench (replicates, formula engine, raw data, chemicals, equipment, images/peaks/graphs) · §4.7 review with correction loop, four-eyes rule | API workflow test + UI walk-through |
| 5 | §4.8–4.10 reports: per-section & combined, NABL / specification options, 4 report types incl. book-style validation, preview → e-signed release, revisions, PDF | API workflow test + PDF inspection |
| 6 | §4.11 dispatch & customer receipt · §4.12 retention & disposal · §4.13 tax invoice (prefill, LUT relaxation, advance, authorize, issue) | API workflow test + UI walk-through |
| 7 | Dashboard (live counts), notifications (§7), traceability view (§8), audit viewer, e-mail outbox, production builds, Docker/compose, CI | Builds; bundled API smoke test |
| 8 | UAT with Lucid Labs, data migration, go-live, hypercare | **Pending — needs client** |

## Decisions taken (reversible)

- **Express instead of NestJS** for the API (see ARCHITECTURE.md).
- **Quotation authorization needs both** Lab HOD confirmation and Authorized Signatory e-signature (as prototyped). Open question 8 — change in `modules/quotations.ts` if Lucid Labs wants either/or.
- **Recording a PO accepts the quotation** (document: "customer accepts the quotation and issues a PO").
- **E-signature = password re-entry** (open question 5). A PIN or digital-certificate scheme can replace `verifySignaturePassword` without changing callers.
- **Report scope:** a report is either one section or combined (all sections). Combined reports are blocked until every section completes (§9).
- **Release requires a preview** by an authorized user after the last change (§4.8 "previews the report before release").
- **Only the assigned analyst can enter data**; Admin cannot enter technical data on someone's behalf.
- **Early disposal** (before the planned date) is allowed only with a remark.
- **Invoice number is assigned at issue**, so cancelled drafts do not leave gaps in the statutory series.
- **E-mail** goes through an outbox; with no SMTP configured messages are stored as `NOT_CONFIGURED`, never reported as sent.

## Open questions for Lucid Labs (from the approved prototype)

1. What does the "OM" registration template stand for, and which sample fields should it capture? (Provisional fields in `apps/web/src/lib/format.ts`.)
2. Lab registered state / GSTIN (CGST+SGST vs IGST) and bank details — enter in **Lab settings**.
3. Report / registration / ULR numbering formats (NABL ULR format, FY reset) — `apps/api/src/lib/numbering.ts`.
4. Default retention per category and approved disposal methods — **Lab settings** (defaults: Pharma 6, others 3 months).
5. E-signature method (PIN, password re-entry, digital certificate).
6. Formula library to pre-configure at go-live (4 seeded: HPLC assay, LOD, moisture, tensile).
7. Customer notification channels: e-mail only, or SMS / WhatsApp too?
8. Quotation authorization: both HOD and Signatory, or either?

## Not in scope yet (backlog)

Customer portal; Tally/accounting export; instrument data import (CSV/LIMS interface); NABL logo image upload (text mark used now); SMS/WhatsApp; S3 storage driver; multi-instance job queue.
