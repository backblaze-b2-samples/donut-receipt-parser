<!-- last_verified: 2026-07-06 -->
# Architecture

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - Pipeline dashboard (documents ingested, parsed, coverage %, recent extractions)
  - Documents library (scoped explorer) with the full create → parse → review → delete lifecycle
  - Document detail: original image beside normalized fields + raw Donut JSON
  - Full-bucket file browser + generic upload (kept from the starter)
  - Dark mode via `next-themes`
- **services/api/** — FastAPI backend (layered architecture)
  - REST API for the Document entity (create/read/run/edit/delete) + generic files
  - **Donut extraction**: OCR-free receipt/invoice parsing, contained in `repo/donut_model.py`
  - B2 S3 integration via boto3 (raw images + extracted JSON + run manifests)
  - Health check endpoint with B2 connectivity verification
  - Structured JSON logging with request tracing
  - Prometheus-format metrics endpoint
- **packages/shared/** — TypeScript type definitions
  - Mirrors Pydantic models from the API (including the extraction schema)
  - Consumed by `apps/web/` as workspace dependency

## Backend Layering

The API follows a strict layered architecture:

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access (boto3 B2 client) — no business logic
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (e.g., service must not import from runtime)
3. `boto3` only allowed in `repo/` layer
4. All boundary data uses Pydantic models (no raw dicts across layers)
5. Each file stays under 300 lines

### Directory Structure

```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Pydantic models (documents.py = extraction schema, files, stats)
    config/                Settings loaded from environment (endpoint derived from B2_REGION)
    repo/                  Data access: b2_client.py (boto3 S3) + donut_model.py (Donut, lazy)
    service/               Business logic: documents.py (CRUD+run), extraction.py (parse), files, metadata
    runtime/               FastAPI route handlers (documents.py, files.py, upload.py, ...)
  tests/                   pytest tests (structural + routes; Donut monkeypatched)
  requirements.txt         Fast-installing core deps
  requirements-ml.txt      Heavy Donut stack (torch, transformers) — installed alongside core
```

### External SDK containment

`boto3` lives only in `repo/b2_client.py`; `torch`/`transformers` live only in
`repo/donut_model.py` with **lazy imports** (inside functions), so the app boots
and the non-parse test suite runs without the ML stack installed. The `service/`
and `runtime/` layers never import an external SDK directly — they call the repo
interface. `service/extraction.py` calls `run_donut()` from the repo; the boto3
boundary is enforced by `tests/test_structure.py::test_boto3_only_in_repo`.

## Boundary Invariants

- **No external SDK leakage**: `boto3` is only imported in `app/repo/`. All other layers interact with B2 through the repo interface.
- **No raw dicts at boundaries**: All data crossing layer boundaries uses typed Pydantic models.
- **No mutable globals**: Configuration is read-only after init. No module-level mutable state shared between layers.
- **Validated inputs**: All HTTP inputs validated by FastAPI/Pydantic. All file keys validated against prefix allowlist.

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently`
  - Web: `localhost:3000`
  - API: `localhost:8000`
- **Railway** — two services from the same repo
  - See `infra/railway/README.md` for configuration

## Data Stores

- **Backblaze B2** — object storage (S3-compatible API), the sole data store.

  ```
  raw-documents/<submitter>/<type>/<timestamp>-<filename>   # uploaded images (create)
  extracted/<year>/<month>/<doc-id>.json                    # normalized + raw extraction (run/edit)
  manifests/<run-id>.jsonl                                   # one JSONL object per parse run
  uploads/<filename>                                         # generic starter upload surface
  ```

  - No application database. A document's `doc_id` is a deterministic SHA-1 hash
    of its raw object key, so `raw-documents/` and `extracted/` correlate with no
    index. `GET /documents` = list `raw-documents/` merged with the set of
    `extracted/**/<doc_id>.json` to derive parse status.
  - S3 has no append, so each parse run writes one fresh `manifests/<run-id>.jsonl`.

## External Services

- **Backblaze B2 S3 API** — object storage, retrieval, deletion, presigned URLs.
- **Donut model** — `naver-clova-ix/donut-base-finetuned-cord-v2`, run **on-device**
  via `transformers`/`torch`. Weights download once from the public Hugging Face
  hub (keyless) and cache locally; no request-time external call, no second API key.

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md) for full security documentation.

- **Frontend -> API** — CORS-restricted to configured origins. `CORSMiddleware` is registered LAST in `main.py` (outermost) so it wraps **every** response, including uncaught-exception 500s — otherwise the browser would block error responses and the UI would only see an opaque "network error". See [docs/RELIABILITY.md](docs/RELIABILITY.md#error-handling).
- **API -> B2** — authenticated via application keys, signature v4
- **Client -> B2** — presigned URLs for download (10-min expiry, forced attachment)

## Data Flows

Document pipeline (primary):

- **Ingest (create)**: Browser -> `POST /documents` (multipart) -> `documents.create_document` validates the image -> repo writes `raw-documents/<submitter>/<type>/<ts>-<file>`
- **Parse (run)**: Browser -> `POST /documents/{doc_id}/parse` -> `documents.parse_one` -> `extraction.parse_document` resolves the raw key -> repo reads image bytes -> `repo.donut_model.run_donut` (device autodetect) -> `extraction.map_cord` normalizes -> repo writes `extracted/<y>/<m>/<doc_id>.json` + `manifests/<run-id>.jsonl`
  - **Batch**: `POST /documents/parse-batch` parses every unparsed document under one shared run manifest.
- **Read**: `GET /documents` (list `raw-documents/` merged with parse status) and `GET /documents/{doc_id}` (image presigned URL + normalized fields + raw dict)
- **Review (edit)**: Browser -> `PATCH /documents/{doc_id}` -> `documents.correct_document` overwrites the extracted JSON scalar header fields, sets `corrected=true`
- **Delete**: Browser -> `DELETE /documents/{doc_id}` -> deletes the raw image AND its extracted JSON, scoped to that doc-id only

Generic file surface (kept from starter): `POST /upload`, `GET /files`,
`GET /files/{key}/download`, `DELETE /files/{key}` as before.

## Observability

- Structured JSON logging on all requests with `request_id`
- Request timing middleware (logs duration per request; also the catch-all that converts uncaught exceptions to a typed JSON 500)
- `/metrics` endpoint (Prometheus format: request count, latency, upload count)
- `/health` endpoint (B2 connectivity check)

## Canonical Files

- Document routes (run/edit verbs): `services/api/app/runtime/documents.py`
- Document orchestration (CRUD + run): `services/api/app/service/documents.py`
- Extraction engine + CORD mapping: `services/api/app/service/extraction.py`
- Donut adapter (repo layer, lazy ML imports): `services/api/app/repo/donut_model.py`
- B2 data access (repo layer): `services/api/app/repo/b2_client.py`
- Pydantic models: `services/api/app/types/` (`documents.py`, `files.py`, `upload.py`, `stats.py`)
- Config (pydantic-settings, endpoint derived from region): `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- Document tests (Donut monkeypatched): `services/api/tests/test_documents.py`
- Frontend API client: `apps/web/src/lib/api-client.ts`
- Shared TypeScript types: `packages/shared/src/types.ts`

## Core Features

- [Document Ingest](docs/features/document-ingest.md)
- [Donut Extraction](docs/features/donut-extraction.md)
- [Document Review](docs/features/document-review.md)
- [Dashboard](docs/features/dashboard.md)
- [File Upload](docs/features/file-upload.md)
- [File Browser](docs/features/file-browser.md)
- [Metadata Extraction](docs/features/metadata-extraction.md)

## References

- [docs/SECURITY.md](docs/SECURITY.md) — security principles and implementation
- [docs/RELIABILITY.md](docs/RELIABILITY.md) — reliability expectations
- [AGENTS.md](AGENTS.md) — architectural invariants and agent instructions
