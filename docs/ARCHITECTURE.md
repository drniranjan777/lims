# Architecture — Lucid Labs LIMS

Functional baseline: `docs/source/Lucid_Labs_LIMS_Software_Flow_for_Client_Approval(1).docx` (section numbers such as §4.6 below refer to it). The approved UI prototype is `docs/source/LIMS_UI_Prototype.html`; its design tokens and role/permission matrix were carried over.

## Overview

```
Browser ──HTTPS──▶ Next.js web (apps/web, :3000) ──/api/v1/* rewrite──▶ Express API (apps/api, :4000) ──▶ PostgreSQL
                         │                                                    │
                         └── same-origin, httpOnly session cookie             ├── local file storage (STORAGE_DIR)
                                                                              ├── SMTP via e-mail outbox (optional)
                                                                              └── in-process jobs (expiry, disposal-due, e-mail)
```

| Part | Tech | Responsibility |
|---|---|---|
| `packages/shared` | TypeScript, Zod | Roles & permissions, status machines, Zod request schemas, GST/totals maths (integer paise), safe formula engine, specification/conformity parser. Imported by both apps so validation and calculations are identical on client and server. |
| `apps/api` | Node 20+, Express 5, Prisma 6, PostgreSQL | REST API, business rules, approval boundaries, e-signatures, audit trail, numbering, PDF generation (pdfmake), notifications, file storage. |
| `apps/web` | Next.js 15 (App Router), React 19, TanStack Query | All screens. Client components fetch the API through a same-origin rewrite. Middleware redirects anonymous users to `/login`. |

**Deviation from the earlier recommendation:** the plan proposed NestJS; the API uses Express 5 with a module-per-feature layout instead. It keeps the codebase smaller and dependency-light while giving the same separation (router → validation → service logic → Prisma) and native async error handling. BullMQ/Redis was replaced by an idempotent in-process scheduler (`apps/api/src/jobs.ts`) — enough for a single-lab deployment; swap when scaling out.

## API layout (`apps/api/src`)

| Path | Purpose |
|---|---|
| `config.ts` | Validates environment at boot; refuses to start with a weak/missing `JWT_SECRET`. |
| `app.ts` | Express app: helmet, JSON limits, cookie parser, origin check (CSRF defence), routers, error mapping. |
| `lib/auth.ts` | bcrypt passwords, JWT session cookie, `requirePerm`, section scoping (`labScope`), e-signature verification + `Signature` rows. |
| `lib/audit.ts` | Append-only audit rows written inside the same transaction as the change. |
| `lib/numbering.ts` | Atomic per-financial-year document numbers (`INSERT … ON CONFLICT … RETURNING`). |
| `lib/workflow.ts` | Section / registration completion and the related notifications (§4.10, §7). |
| `lib/notify.ts` | In-app notifications; e-mail outbox + SMTP delivery. |
| `lib/storage.ts` | File storage abstraction (local disk, path-traversal safe, SHA-256 per file). |
| `modules/*` | One router per workflow area: auth, users, masters (incl. customers, settings), enquiries, quotations, receipts (PO + sample receipt), registrations, section, tests (analyst + review), reports, dispatch, stores, invoices, misc (dashboard, notifications, audit, attachments). |
| `pdf/` | Quotation, tax invoice and test report (standard + book-style validation) PDFs. |

## Security & data integrity

- **Authentication:** e-mail + password (bcrypt, cost 12); 5 failed attempts lock the account for 15 min; login rate-limited. Session = signed JWT in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). Changing a password invalidates existing sessions.
- **Authorization:** every route declares the permission it needs (`requirePerm`). The role→permission matrix is in `packages/shared/src/roles.ts` and mirrors §3/§9. Section Approvers and Analysts are additionally restricted to their assigned lab sections.
- **Approval boundaries enforced server-side (§9):** CRM cannot review/release; analysts cannot release; only the assigned analyst enters data; a reviewer cannot approve their own test (four-eyes); release requires a preview first and all scoped tests approved; combined reports require every section complete; method changes and tests not on the quotation require *Edit / modify tests & methods*; customer details on a report require *Edit customer details before final report*.
- **Electronic signatures:** quotation authorization, registration approval, test submission, review, report release and invoice authorization require password re-entry; each creates a `Signature` row and an audit entry.
- **Audit trail:** every create/update/status change/signature/login writes `AuditLog` (user, action, before/after, reason, IP) in the same DB transaction.
- **Immutability:** released reports are locked; the signed PDF is stored with its SHA-256 and a JSON content snapshot. Corrections are issued as revisions (same number, `Rev n`) with a mandatory reason.
- **Formulas** are evaluated by a dedicated parser (no `eval`), and are frozen onto each registered test so later master edits cannot change historic results.
- **Uploads:** MIME allow-list, size limit (`MAX_UPLOAD_MB`), random storage keys, `nosniff` on download, access restricted to the test's section/analyst.
- **CSRF:** SameSite cookie + Origin check on state-changing requests.
- **Secrets:** only via environment (`.env` is git-ignored; `.env.example` documents every variable).

## Key flows

1. **Commercial:** Enquiry → Quotation (Draft → Internal review: HOD confirms tests/methods/specs → Signatory e-signs → Sent) → PO recorded (auto-accepts) → Sample receipt.
2. **Laboratory:** Pre-registration (template Pharma/Mech/OM/Gen; tests copied from quotation) → Reviewer e-signs registration (creates per-section work rows; customer e-mail) → Section Approver receives & allocates → Analyst records observations/formula/replicates, chemicals, equipment (calibration/expiry checked), attachments → submits (e-sign) → Reviewer approves or returns (e-sign).
3. **Reporting:** Report per section or combined → preview (watermarked) → release (e-sign, PDF frozen) → dispatch (combined-report verification) → customer receipt.
4. **Closure:** Remnant sample retention (template-based default period) → disposal (method, person; early disposal needs a reason). Tax invoice (prefilled from quotation rates; GST intra/inter; LUT relaxation; advance) → authorize (e-sign) → issue (statutory number) → dispatch.

## Background jobs

`jobs.ts` runs every minute/hour: deliver queued e-mails (when SMTP is configured), expire sent quotations past validity, mark remnant samples due for disposal and notify Stores. All jobs are idempotent.
