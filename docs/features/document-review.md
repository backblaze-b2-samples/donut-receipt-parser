<!-- last_verified: 2026-07-06 -->
# Feature: Document Review & Structured-Data Store

## Purpose
Let a human correct or complete the header fields the model can't reliably infer
(merchant, date, currency, totals) — the **edit** verb — and describe the
structured-data store the pipeline writes to B2.

## Used By
- UI: `/documents/[docId]` → "Correct fields" dialog (`components/documents/correct-fields-form.tsx`)
- API: `PATCH /documents/{doc_id}`, `DELETE /documents/{doc_id}`

## Core Functions
- `apps/web/src/components/documents/correct-fields-form.tsx` — pre-filled edit form
- `apps/web/src/components/documents/document-detail.tsx` — image + fields + raw JSON + actions
- `apps/web/src/lib/queries.ts` — `useCorrectDocument()`, `useDeleteDocument()`
- `services/api/app/service/documents.py` — `correct_document()`, `delete_document()`
- `services/api/app/service/extraction.py` — `read_extracted()`, `write_extracted()`, `write_manifest()`

## Canonical Files
- Pattern exemplar: `apps/web/src/components/settings/settings-form.tsx` (form conventions)

## Inputs
- doc_id: string (path)
- CorrectionRequest (JSON): merchant, date, currency (Select), document_type (Select), subtotal, tax, total

## Outputs
- Updated `DocumentDetail` with `extracted.corrected = true`
- Side effect: the `extracted/<y>/<m>/<doc_id>.json` object is overwritten in place

## Structured-data store
- Per-document JSON under `extracted/<year>/<month>/<doc_id>.json` (normalized view + raw Donut dict)
- One JSONL manifest per parse run under `manifests/<run-id>.jsonl` for incremental downstream processing (S3 has no append, so each run is a fresh object)
- No database — B2 is the sole store; `doc_id` correlates raw and extracted objects

## Form UX
- Scalar header fields only. **Line items are read-only in v1** — a deliberate
  scoping note (line-item table editing is downstream-tool scope; the
  finance-critical corrections are the header fields). This is not an omitted CRUD verb.
- Selectors (not free text) for the finite-option fields (currency, document_type).

## Flow
- User opens a parsed document and clicks "Correct fields"
- The form pre-fills from the extracted JSON; the user fixes merchant/date/etc.
- `PATCH` overwrites the extracted JSON and flags it corrected
- Delete removes the raw image AND extracted JSON for that doc-id only

## Edge Cases
- Correcting an unparsed document → 404 ("Document has not been parsed yet")
- Delete of a missing document → 404
- Invalid currency/document_type → 400/422

## Verification
- Test files: `services/api/tests/test_documents.py` (`test_correct_fields`, `test_delete_document_removes_raw_and_extracted`)
- Required cases: correct a parsed doc, correct-before-parse 404, scoped delete
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: corrected JSON persisted with `corrected=true`; delete removes both objects only for that doc-id

## Related Docs
- [README.md](../../README.md)
- [Donut Extraction](donut-extraction.md)
- [docs/app-workflows.md](../app-workflows.md)
