<!-- last_verified: 2026-07-06 -->
# Feature: Document Ingest

## Purpose
Upload a receipt or invoice image into Backblaze B2 as the raw source for extraction (the **create** verb of the Document entity).

## Used By
- UI: `/documents` → "Add document" dialog (`components/documents/add-document-form.tsx`)
- API: `POST /documents` (multipart)

## Core Functions
- `apps/web/src/components/documents/add-document-form.tsx` — dropzone + submitter/type fields
- `apps/web/src/lib/api-client.ts` — `createDocument()`
- `apps/web/src/lib/queries.ts` — `useCreateDocument()`
- `services/api/app/runtime/documents.py` — `POST /documents`
- `services/api/app/service/documents.py` — `create_document()`
- `services/api/app/service/extraction.py` — `build_raw_key()`, `doc_id_for_key()`
- `services/api/app/repo/b2_client.py` — `put_object_bytes()`

## Canonical Files
- Pattern exemplar: `services/api/app/service/documents.py` (`create_document`)

## Inputs
- image: file (multipart, JPEG/PNG/WebP/GIF) — required
- submitter_id: string (form field; free text, e.g. `acct-team-01`)
- document_type: `receipt | invoice` (form field, Select; default `receipt`)

## Outputs
- `DocumentCreateResponse` (doc_id, source_key, filename, document_type, submitter_id)
- Side effect: object written to `raw-documents/<submitter>/<type>/<timestamp>-<filename>` in B2

## Flow
- User picks an image and fills submitter ID + type in the Add document dialog
- Client posts multipart to `POST /documents`
- Service validates the content type, builds the raw key, writes bytes to B2
- `doc_id` is derived as a deterministic hash of the raw key

## Edge Cases
- Non-image content type → 415
- Empty file → 400
- Invalid document_type → 400

## UX States
- Empty: dropzone prompt
- Loading: "Uploading N%" on the submit button
- Error: toast with the rejection reason

## Verification
- Test files: `services/api/tests/test_documents.py` (`test_create_document`, `test_create_rejects_non_image`)
- Required cases: happy path, non-image rejection, empty file
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: object appears under `raw-documents/`; doc_id returned

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/app-workflows.md](../app-workflows.md)
