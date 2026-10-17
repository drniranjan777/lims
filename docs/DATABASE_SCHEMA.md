# Database schema — Lucid Labs LIMS

PostgreSQL, managed with Prisma migrations (`apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`). Money uses `NUMERIC(12,2)`; calculated results `NUMERIC(20,6)`; business dates are `DATE` in IST.

## Traceability chain (§8)

```
Customer ─┬─ Contact
          ├─ Enquiry ── EnquiryTest
          └─ Quotation ── QuotationItem
                 ├─ PurchaseOrder
                 └─ SampleReceipt ── Registration ─┬─ RegistrationSection   (one per lab section; drives combined-report completeness)
                                                   ├─ RegistrationTest ─┬─ ChemicalUsage ── Chemical
                                                   │                    ├─ EquipmentUsage ── Equipment
                                                   │                    ├─ TestReviewEvent  (submit / return / approve)
                                                   │                    └─ Attachment       (images, peaks, graphs, raw data)
                                                   ├─ Report ── DispatchItem ── Dispatch
                                                   ├─ RetainedSample  (retention → disposal)
                                                   └─ InvoiceItem ── Invoice ── DispatchItem
```

## Tables

| Table | Purpose / key columns |
|---|---|
| `User`, `UserRole`, `UserSection` | Staff accounts; many roles per user; section assignments for scoped roles. Lockout fields `failedLogins`, `lockedUntil`; `passwordChangedAt` invalidates sessions. |
| `Signature` | Electronic signatures: `userId`, `entityType`, `entityId`, `meaning` (AUTHORED, REVIEWED, APPROVED, RELEASED, AUTHORIZED), `signedAt`. |
| `AuditLog` | Append-only trail: `userId/userName`, `action`, `entityType/entityId`, `before`, `after` (JSONB), `reason`, `ip`, `at`. |
| `Setting` | Key/value JSON; key `lab` holds lab profile, GST rate, SAC, bank details, terms, retention defaults, disposal methods. |
| `NumberSequence` | (`series`, `period`) → `nextValue`. Period = Indian FY (`2026-27`) or `ALL`. |
| `Section` | Lab sections (Chemical, Instrumental, Microbiology, Mechanical …). |
| `Customer`, `Contact` | Customer master with GSTIN and state code; contacts are deactivated, never deleted. |
| `TestMaster` | Test catalogue: method, default specification, unit, rate, NABL flag, report type, replicates, decimals, formula. |
| `Formula` | Expression + declared variables (JSON) + display form + result unit. |
| `Equipment` | ID, name, section, `calibrationDue` (blocks use when past). |
| `Chemical` | Chemicals / standards / reference standards / media / reagents with lot, potency, expiry (blocks use when expired). |
| `Enquiry`, `EnquiryTest` | §4.1 — source (PHONE/MAIL/WALK_IN/REFERENCE/OTHER), references, courier/receipt details, status NEW → IN_DISCUSSION → QUOTATION_PREPARED → CLOSED. |
| `Quotation`, `QuotationItem` | §4.2 — snapshot of item test/method/spec/rate; totals (subtotal, discount, taxable, CGST/SGST/IGST rates & amounts, round-off, total); HOD review & authorization stamps; status DRAFT → INTERNAL_REVIEW → SENT → ACCEPTED/REJECTED/EXPIRED. |
| `PurchaseOrder` | §4.3 — customer PO number/date/value per quotation (unique per quotation). |
| `SampleReceipt` | §4.3 — receipt number, mode, courier/docket, number of samples, condition; status AWAITING_SAMPLE/RECEIVED/PRE_REGISTERED/REGISTERED. |
| `Registration` | §4.4 — registration number, template (PHARMA/MECH/OM/GEN), sample details + `templateData` JSON, pre-registration and approval stamps; status PRE_REGISTERED → REGISTERED → IN_TESTING → TESTING_COMPLETE → REPORTED (or CANCELLED). |
| `RegistrationSection` | §4.5/§4.10 — per-section status PENDING → RECEIVED → IN_PROGRESS → COMPLETED. |
| `RegistrationTest` | §4.6/§4.7 — test/method/spec copy, `formulaSnapshot`, analyst, `observations` JSON (replicate inputs + computed values), raw data, environment, `calculatedValue`, `finalResult`, `conformity`, review fields; status UNASSIGNED → ASSIGNED → IN_TESTING → SUBMITTED → CORRECTION_REQUIRED ⇄ … → APPROVED. |
| `ChemicalUsage`, `EquipmentUsage` | Usage logs per test (lot copied; calibration due date at time of use). |
| `TestReviewEvent` | Review history with comments. |
| `Attachment` | Generic file table (`entityType/entityId`, kind, mime, size, `storageKey`, `sha256`, `includeInReport`). Also stores released report PDFs (`kind = REPORT_PDF`). |
| `Report` | §4.8–4.10 — `number` + `revision` (unique together), `sectionId` (null = combined), format STANDARD/VALIDATION, NABL & specification flags, issued-to snapshot, preview/release stamps, `contentSnapshot`, `pdfAttachmentId`; status DRAFT → PREVIEW → RELEASED → DISPATCHED. |
| `Dispatch`, `DispatchItem` | §4.11 — date, mode, courier/docket, dispatched by, combined-report verifier, customer receipt date & receiver; items reference reports and/or invoices. |
| `RetainedSample` | §4.12 — received in store (date, by), location, quantity, retention months, planned disposal date, actual disposal (date, method, by); status IN_STORE / RETENTION_ACTIVE / DUE_FOR_DISPOSAL / DISPOSED. |
| `Invoice`, `InvoiceItem` | §4.13 — draft number vs statutory number (assigned on issue), customer GSTIN snapshot, place of supply, GST split, tax relaxation + reference, PO value, advance + reference, balance due; status DRAFT → APPROVED → ISSUED → DISPATCHED (or CANCELLED). Items link to registrations (prevents double billing). |
| `Notification` | In-app notifications per user (§7). |
| `EmailOutbox` | Queued customer e-mails with delivery status (PENDING/SENT/FAILED/NOT_CONFIGURED) and attempts. |

## Document numbering

| Series | Format | Reset |
|---|---|---|
| Customer | `CUS-0001` | never |
| Enquiry | `ENQ/2026-27/0001` | each FY (April) |
| Quotation | `QTN/2026-27/0001` | each FY |
| Sample receipt | `SRN/2026-27/0001` | each FY |
| Registration | `LL/2026-27/00001` | each FY |
| Test report | `TR/2026-27/00001` (+ `Rev n`) | each FY |
| Draft invoice | `DRAFT-INV/2026-27/0001` | each FY |
| Tax invoice | `INV/2026-27/0001` (consecutive, assigned at issue) | each FY |
| Dispatch | `DSP/2026-27/0001` | each FY |

Formats are provisional (open question: NABL ULR format) and live in one place, `apps/api/src/lib/numbering.ts`.

## Migrations

| Migration | Change |
|---|---|
| `20261017083143_init` | Initial schema. |
| `20261017090000_report_revision_unique` | Report uniqueness on (`number`, `revision`) so revisions keep the original number. |

Production deploys run `prisma migrate deploy` (forward-only, non-destructive).
