# Build plan — `donut-receipt-parser`

Source of truth for the starter tree:
`.claude/scratch/vcsk-f9553a27-f289-47c5-8088-53dce4c9428c/` (cloned fresh in Phase 0).
Every "keep" below refers to that tree; every "add" is new.

---

## 1. Purpose

`donut-receipt-parser` is a B2 sample for accounting teams, expense platforms, and
logistics operators that need structured data (line items, subtotal, tax, total —
plus human-supplied merchant/date) pulled out of receipt and invoice **images**
with **no OCR preprocessing step**. It runs [Donut](https://github.com/clovaai/donut)
(`naver-clova-ix/donut-base-finetuned-cord-v2`) **locally** to read each document
image end-to-end and emit JSON directly. Backblaze B2 is the single store for both
the raw uploaded document images (`raw-documents/`) and the derived structured-data
artifacts (`extracted/<year>/<month>/<doc-id>.json` plus per-run JSONL manifests) —
all via the S3-compatible API. It demonstrates a continuous ingest → parse → store →
serve loop where bulk write volume (raw images + JSON outputs) accumulates in B2 as
an audit trail, with no second API key: **B2 credentials only**.

---

## 2. Architecture delta from vibe-coding-starter-kit

The starter kit is the ceiling — strip what this app doesn't need, keep the
reusable B2 surface, add the Donut extraction pipeline.

### KEEP (as-is — starter contract, do not strip/rename/replace)
- Entire UI kit: `apps/web/src/components/ui/**`, design tokens in
  `apps/web/src/app/globals.css`, and the `/design` reference page.
- **Bucket explorer (full-bucket browse) — NON-NEGOTIABLE KEEP**: `/files` route,
  `apps/web/src/app/files/`, `apps/web/src/components/files/**`, and its **Files**
  sidebar entry. This is the whole-bucket surface and is never removable.
- **Upload**: `/upload` route + `apps/web/src/components/upload/**` + its sidebar
  entry — the generic B2 upload surface stays.
- `/settings` route + `settings-form.tsx` (also our **form exemplar**, see §4).
- Layout shell: `app-sidebar.tsx`, `header.tsx`, `theme-provider`, `command-palette`,
  `health-banner`.
- FastAPI layered architecture (`types → config → repo → service → runtime`),
  structural tests, `/health`, `/metrics`, JSON logging, TanStack Query data layer,
  `packages/shared` types, `scripts/*`, `infra/railway`, the full docs skeleton.
- Metadata-extraction feature (`service/metadata.py`, `docs/features/metadata-extraction.md`)
  — stays because the upload page still uses it; incidental, not featured.

### TRIM (remove from starter)
- Nothing structural. The starter's "dashboard shows generic upload stats" is
  **adapted**, not trimmed (see below). No routes/components are deleted — this
  keeps the delta low-risk and avoids doc drift. (The dashboard's *content* is
  replaced but the files remain.)

### ADD (new for donut-receipt-parser)
- **Sample-specific scoped explorer (mandatory add):** a **Documents** library at
  `/documents` scoped to this app's own `raw-documents/` + `extracted/` prefixes
  (distinct from the full-bucket `/files` explorer). Lists each document with its
  parse **status** (Parsed / Not parsed) and an extracted-total summary. New sidebar
  entry "Documents" (lucide `FileText` / `ReceiptText`).
- **Document detail** at `/documents/[docId]`: original image beside the normalized
  extracted fields + the raw Donut JSON; action buttons for Parse/Re-parse, Correct
  fields, Delete.
- **Backend Donut adapter** `services/api/app/repo/donut_model.py` — loads
  `DonutProcessor` + `VisionEncoderDecoderModel` (lazy, cached), runs inference,
  returns the raw `token2json` dict. External ML SDK is **contained in `repo/`**,
  mirroring `b2_client.py` (keeps `service/` free of heavy SDKs — consistent with
  the "contain external SDKs in repo/" invariant). Device autodetect here.
- **Extraction service** `services/api/app/service/extraction.py` — orchestrates:
  read image bytes (b2 repo) → Donut infer (donut repo) → map CORD raw → normalized
  schema → write `extracted/…json` + append to the run manifest (b2 repo).
- **Documents service/routes** — `service/documents.py`, `runtime/documents.py`
  (list/detail/create/parse/parse-batch/correct/delete + pipeline stats).
- New Pydantic types (`types/documents.py`) + shared TS types.
- New B2 repo helpers (all S3): `get_object_bytes`, generic `put_object_bytes`,
  `object_exists` (reuse existing `list_files`, `delete_file`, `get_presigned_url`,
  `head_object`).
- **Adapt Dashboard** (`/` + `apps/web/src/components/dashboard/**`): replace generic
  upload metrics with pipeline metrics — Documents ingested, Documents parsed, Parse
  coverage %, and a Recent extractions table (merchant/total/parsed-at). New
  aggregations flow through `runtime → service → repo` and TanStack Query hooks
  (no bare `useEffect+fetch`).
- `requirements-ml.txt` for the heavy Donut stack (kept out of the fast-installing
  core `requirements.txt`).

**Bucket-explorer tension note:** none. The full-bucket `/files` explorer and the
scoped `/documents` explorer coexist cleanly — `/files` is "browse the whole
bucket", `/documents` is "manage this app's receipts". Both ship.

---

## 3. B2 surface (S3-compatible only)

All operations via the boto3 S3 client in `repo/b2_client.py`. **No b2-native API.**
Custom user agent set on the client (`user_agent_extra="donut-receipt-parser"`).
Standard `B2_*` env vars (see §6 rename table).

| Operation | S3 call | Used for |
|-----------|---------|----------|
| Upload raw image | `put_object` | create → `raw-documents/…` |
| Write extracted JSON | `put_object` | run → `extracted/<y>/<m>/<doc-id>.json` |
| Write run manifest | `put_object` | run → `manifests/<run-id>.jsonl` (new object per run — S3 has no append) |
| Read image / JSON bytes | `get_object` | parse input, detail view |
| List documents | `list_objects_v2` | `raw-documents/` + `extracted/` (merge → status) |
| Object metadata | `head_object` | size/type/exists |
| Presigned URL | `generate_presigned_url` | image display + download (10-min expiry) |
| Delete | `delete_object` | delete verb (raw + extracted, scoped to doc-id) |
| Stats | `list_objects_v2` (paginated) | dashboard pipeline metrics |

No b2-native use anywhere → nothing to justify.

---

## 4. Key features

Feature list (seeds README + `docs/features/*.md` stubs):

1. **Document ingest** — upload receipt/invoice images to B2 `raw-documents/`; the
   key encodes submitter ID + upload timestamp. → `docs/features/document-ingest.md`
2. **OCR-free Donut extraction (the marquee, run verb)** — Donut reads the image
   end-to-end and emits structured JSON (line items, subtotal, tax, total). →
   `docs/features/donut-extraction.md`
3. **Human-in-the-loop review (edit verb)** — correct/complete the extracted header
   fields (merchant, date, currency, totals) the model can't reliably infer; writes
   corrected JSON back to B2. → `docs/features/document-review.md`
4. **Structured-data store + run manifest** — per-document JSON under
   `extracted/<y>/<m>/` and a JSONL manifest per batch run for incremental
   downstream processing. → `docs/features/document-review.md` (store section)
5. **Pipeline dashboard** — ingested / parsed / coverage %, recent extractions. →
   rewrite `docs/features/dashboard.md`
6. **Reusable B2 surface** — full-bucket explorer + generic upload (kept from
   starter). → keep `docs/features/file-browser.md`, `file-upload.md`

### External API provider — per feature
- **Feature 2 (Donut extraction):** `deployment: **local**`.
  - Provider/model: **Donut**, `naver-clova-ix/donut-base-finetuned-cord-v2`
    (fine-tuned on CORD receipts; emits line items + subtotal/tax/total). This is
    the sample's whole point → do not substitute (api-provider-selection.md step 1,
    on-device branch).
  - Cost for one full demo run: **$0** (runs on-device; weights ~0.8 GB downloaded
    once from the public HF hub, keyless, then cached).
  - Env var for a key: **none** — B2 credentials only. No second key anywhere.
  - **CPU-default / GPU-autodetect (hard rule):** pick first available of
    CUDA → Apple MPS → CPU at runtime. **MPS caveat:** Donut's
    `VisionEncoderDecoderModel.generate` has hit unsupported-op / dtype issues on
    MPS; wrap the MPS path so a failed generate **falls back to CPU** for that call
    and log it. CPU inference of one receipt is slow (~10–30 s) but must complete.
- All other features: no external provider (B2 only).

### Provider orchestration via Genblaze
- Not applicable — the description does **not** mention Genblaze / `genblaze-*` /
  "Suggested stack". Donut runs directly via `transformers`. No Genblaze packages.

### Primary-entity lifecycle (mandatory)
**Primary entity: `Document`** — a receipt/invoice tracked from raw image →
extracted structured data. The UI exposes **all five verbs**; `omitted_ui_verbs`
is expected to be **empty**.

| Verb | UI surface | Backend | Notes |
|------|-----------|---------|-------|
| **create** | "Add Document" form on `/documents` (dropzone + fields) | `POST /documents` (multipart) → `raw-documents/…` | see form UX below |
| **read** | `/documents` list (scoped explorer) + `/documents/[docId]` detail | `GET /documents`, `GET /documents/{doc_id}` | image + normalized fields + raw JSON |
| **run** | "Parse" / "Re-parse" button on detail; "Parse all unparsed" on list | `POST /documents/{doc_id}/parse`, `POST /documents/parse-batch` | Donut inference → writes JSON + manifest |
| **edit** | "Correct fields" form on detail (pre-filled from parsed JSON) | `PATCH /documents/{doc_id}` → overwrite `extracted/…json` | scalar header fields only (see below) |
| **delete** | "Delete" (AlertDialog confirm) on detail + row action | `DELETE /documents/{doc_id}` | deletes raw **and** extracted for that doc-id only |

Scope guard: one entity, CRUD+run only. "Parse all unparsed" is an extra affordance
of the **run** verb (batch), not a new verb.

### Form UX conventions (exemplar: `settings/settings-form.tsx`)
**Create form ("Add Document"):**
- `image` — dropzone (file). Required.
- `submitter_id` — **Input** (free text; part of the key convention). Placeholder
  guidance e.g. `acct-team-01` (guidance only, no autofill button).
- `document_type` — **Select** (finite: `receipt` | `invoice`). Default `receipt`,
  surfaced via `FormDescription` / default value. Stored as metadata + used to
  organize the key. (Both types route to the CORD checkpoint — CORD handles
  receipt-style docs; `document_type` tags the output.)

**Edit form ("Correct fields", pre-filled from parsed JSON):**
- `merchant` — **Input** (free text; model often can't infer → human fills).
- `date` — **Input** `type="date"` (free value).
- `currency` — **Select** (finite: `USD` | `EUR` | `GBP` | `JPY` | `Other`).
- `document_type` — **Select** (`receipt` | `invoice`).
- `subtotal`, `tax`, `total` — **Input** numeric (free values).
- Line items shown **read-only** in v1 (justification recorded: line-item table
  editing is downstream-tool scope; the finance-critical corrections are the scalar
  header fields). This is a UX scoping note, not an omitted CRUD verb.
- Selector rule applies to both forms; default-hint rule applies to create only
  (edit opens pre-filled with the real resource).

### Normalized extracted schema (honest mapping — vendor/model fidelity)
Donut CORD-v2 `token2json` yields roughly `{menu:[{nm,cnt,price}], sub_total:{…},
total:{…}}`. **CORD does not reliably emit merchant or date** — so the sample maps
what the model actually produces and leaves merchant/date null until a human fills
them (this is exactly why the review/edit verb exists — a genuine value-add, not a
pretend field). Store both the normalized view and the raw dict:

```json
{
  "doc_id": "…", "source_key": "raw-documents/…",
  "document_type": "receipt", "submitter_id": "…",
  "parsed_at": "…Z", "model": "naver-clova-ix/donut-base-finetuned-cord-v2",
  "device": "cpu|mps|cuda",
  "merchant": null, "date": null, "currency": "USD",
  "line_items": [{"name": "…", "qty": "…", "price": "…"}],
  "subtotal": "…", "tax": "…", "total": "…",
  "raw": { … full Donut token2json … },
  "corrected": false
}
```
`doc_id` is a deterministic slug/hash of the raw key so `raw-documents/` and
`extracted/<y>/<m>/<doc_id>.json` correlate with **no database** (B2 is the sole
store). `GET /documents` = list `raw-documents/` (→ doc_ids) merged with the set of
`extracted/**/<doc_id>.json` (→ parsed status).

---

## 5. Doc transforms

- **Rewrite:** `README.md` (full rebrand — see §6, new feature list, ML-deps +
  first-run model-download + device note, B2 storage layout, standardized env vars),
  `ARCHITECTURE.md` (add Donut repo adapter + extraction service + storage layout +
  ingest/parse/correct/delete data flows), `docs/features/dashboard.md` (pipeline
  metrics), `docs/app-workflows.md` (ingest → parse → review → serve journey),
  `AGENTS.md` §2 keep-list note (mention Documents surface), `.env.example`.
- **Add stubs (from `_template.md`):** `docs/features/document-ingest.md`,
  `docs/features/donut-extraction.md`, `docs/features/document-review.md`.
- **Keep as-is:** `docs/features/file-upload.md`, `file-browser.md`,
  `metadata-extraction.md`, `SECURITY.md`, `RELIABILITY.md`, `dev-workflows.md`,
  `design-system.md`, exec-plans skeleton.
- **Delete:** none (keeps drift low).

---

## 6. Rename table

### Identifiers (`vibe-coding-starter-kit` → `donut-receipt-parser`)
| Kind | From | To |
|------|------|----|
| kebab / repo / root pkg name | `vibe-coding-starter-kit` | `donut-receipt-parser` |
| snake (py, keys) | `vibe_coding_starter_kit` | `donut_receipt_parser` |
| Title Case | `Vibe Coding Starter Kit` / `OSS Starter Kit` | `Donut Receipt Parser` |
| web pkg | `@vibe-coding-starter-kit/web` | `@donut-receipt-parser/web` |
| shared pkg | `@vibe-coding-starter-kit/shared` | `@donut-receipt-parser/shared` |
| `APP_NAME` (`app-config.ts`) | `"OSS Starter Kit"` | `"Donut Receipt Parser"` |
| `APP_DESCRIPTION` | `"File management dashboard powered by Backblaze B2"` | `"OCR-free receipt & invoice extraction with Donut, stored on Backblaze B2"` |
| S3 `user_agent_extra` (`b2_client.py`) | `"b2ai-oss-start"` | `"donut-receipt-parser"` |
| UTM `utm_content=` (README/sidebar/marketing links) | `b2ai-oss-start` | `donut-receipt-parser` |
| pnpm `--filter` targets (root `package.json` scripts) | `@vibe-coding-starter-kit/web` | `@donut-receipt-parser/web` |
| shared import specifier (`queries.ts`, others) | `@vibe-coding-starter-kit/shared` | `@donut-receipt-parser/shared` |
| e2e / playwright filter (`test:e2e`) | `@vibe-coding-starter-kit/web` | `@donut-receipt-parser/web` |
| Railway service refs (`infra/railway/README.md`) | vibe-coding-starter-kit | donut-receipt-parser |
| README title + prose, AGENTS.md/CLAUDE.md refs | Vibe Coding Starter Kit | Donut Receipt Parser |

### Branding-leak fixes (known starter gotcha)
- Set `APP_NAME` in `apps/web/src/lib/app-config.ts` (single source — updates
  sidebar/header/breadcrumb).
- `header.tsx` `pageTitles` map: add `"/documents": "Documents"`. The detail route
  `/documents/[docId]` must render a real title (not the raw id segment) — set the
  page's own heading and, if relying on the breadcrumb, override the derived title
  so it doesn't show the doc-id hash.

### Env vars (Standard #3 — the starter deviates; rename to standard)
| Starter | Standard (required by b2-doctor) |
|---------|----------------------------------|
| `B2_KEY_ID` | `B2_APPLICATION_KEY_ID` |
| `B2_APPLICATION_KEY` | `B2_APPLICATION_KEY` (unchanged) |
| `B2_BUCKET_NAME` | `B2_BUCKET_NAME` (unchanged) |
| `B2_ENDPOINT` | **`B2_REGION`** (derive endpoint `https://s3.<region>.backblazeb2.com`) |
| `B2_PUBLIC_URL` | `B2_PUBLIC_URL_BASE` |

Update everywhere: `config/settings.py` (fields `b2_application_key_id`, `b2_region`,
`b2_public_url_base`; derive endpoint from region), `b2_client.py`, `.env.example`,
`README.md`, `scripts/doctor.mjs`, and any `infra/railway` reference. Final env set
must be exactly: `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`,
`B2_REGION`, `B2_PUBLIC_URL_BASE`.

---

## 7. Dependencies — Donut ML stack (guidance; builder MUST verify end-to-end)

Put in **`services/api/requirements-ml.txt`** (heavy; keep core `requirements.txt`
fast). README setup installs both. Working window (verify, don't trust):
```
transformers>=4.40,<4.46
torch>=2.2,<2.5
sentencepiece>=0.2.0     # Donut's XLMRoberta tokenizer needs it
protobuf>=4.25,<6        # tokenizer conversion
# Pillow already in core requirements.txt
```
**Lazy imports:** import `torch`/`transformers` **inside** the functions of
`repo/donut_model.py` (not at module top) so the app boots and non-parse tests pass
without the ML stack installed, and boot stays fast.

**Verification is mandatory and non-negotiable (unpinned-ML-deps lesson):** a green
`pnpm test:api` + boot does NOT prove Donut works. The builder must run **one real
end-to-end parse**: generate a synthetic receipt image at runtime (PIL text on
white, in a temp dir — **do not commit any binary asset**), load the model, run
`generate` + `token2json`, and assert a dict comes back. This is the only thing that
catches broken pins / missing `sentencepiece` / device traps. Backend route tests
must **monkeypatch** `repo.donut_model` inference to return a fixed CORD dict so the
test suite needs neither torch nor a model download.

---

## 8. Build priorities (avoid the timeout-skips-frontend trap)

The builder has historically timed out and skipped the frontend-wiring phase, leaving
404 routes / unreachable pipeline / lint failures behind a green backend. Build in
this order and do not stop early:
1. Backend: env-var rename (config/settings + b2_client + .env.example + doctor),
   B2 repo helpers, Donut repo adapter, extraction + documents services, routes.
2. `packages/shared` types + `lib/api-client.ts` + `lib/queries.ts` hooks.
3. **Frontend wiring of ALL new routes** (`/documents`, `/documents/[docId]`),
   sidebar entry, header pageTitles, create/edit forms, dashboard adaptation — so
   there are **no 404s and no unused-import lint errors**.
4. Tests (routes with monkeypatched Donut; structural tests stay green).
5. Docs (README, ARCHITECTURE, feature stubs, workflows).
Confirm before finishing: `pnpm lint`, `pnpm build`, `pnpm lint:api`,
`pnpm test:api`, `pnpm check:structure` all pass, and every sidebar link resolves.
