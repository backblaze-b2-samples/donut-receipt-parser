<!-- last_verified: 2026-07-06 -->
# Feature: Donut Extraction (marquee)

## Purpose
Read a receipt/invoice image end-to-end with the Donut model and emit structured
JSON — line items, subtotal, tax, total — with **no OCR preprocessing step**
(the **run** verb of the Document entity).

## Used By
- UI: `/documents/[docId]` → "Parse" / "Re-parse"; `/documents` → "Parse all unparsed"
- API: `POST /documents/{doc_id}/parse`, `POST /documents/parse-batch`

## Core Functions
- `services/api/app/repo/donut_model.py` — `run_donut()`, `get_device()` (lazy torch/transformers, device autodetect)
- `services/api/app/service/extraction.py` — `parse_document()`, `extract_and_store()`, `map_cord()`, `write_manifest()`
- `services/api/app/service/documents.py` — `parse_one()`, `parse_batch()`
- `services/api/app/runtime/documents.py` — parse routes
- `apps/web/src/lib/queries.ts` — `useParseDocument()`, `useParseBatch()`

## Canonical Files
- Pattern exemplar: `services/api/app/repo/donut_model.py` (external ML SDK contained in repo/, mirroring `b2_client.py`)

## Model / deployment
- Model: `naver-clova-ix/donut-base-finetuned-cord-v2` (Donut fine-tuned on CORD receipts)
- Deployment: **local / on-device**. Weights (~0.8 GB) download once from the public HF hub (keyless) and cache. No second API key — B2 credentials only.
- Device: autodetect CUDA → Apple MPS → CPU (default CPU). On MPS, a failed `generate` falls back to CPU for that call and is logged.

## Inputs
- doc_id: string (path) — resolves to a `raw-documents/` image

## Outputs
- `ParseResponse` (doc_id, status, extracted: `ExtractedData`)
- Side effects: `extracted/<year>/<month>/<doc_id>.json` + `manifests/<run-id>.jsonl` written to B2

## Normalized schema (honest CORD mapping)
CORD-v2 `token2json` yields roughly `{menu:[{nm,cnt,price}], sub_total:{…}, total:{…}}`.
The mapper produces `line_items` (name/qty/price), `subtotal`, `tax`, `total`, and
stores the full raw dict. **CORD does not reliably emit merchant or date**, so
those stay `null` until a human fills them via [Document Review](document-review.md).

## Flow
- Resolve the raw key from doc_id → read image bytes from B2
- `run_donut` loads the cached model, runs `generate` + `token2json`
- `map_cord` normalizes; the service writes the extracted JSON + run manifest

## Edge Cases
- Inference failure on CPU/CUDA → 502; MPS failure → CPU fallback
- `token2json` returns a non-dict → wrapped as `{raw_text: …}`
- Re-parse overwrites the extracted JSON for that doc_id

## UX States
- Not parsed: "Not parsed yet" empty state with a Parse action
- Loading: "Parsing..." on the button
- Parsed: fields + raw JSON tabs

## Verification
- Route/unit tests (Donut monkeypatched): `services/api/tests/test_documents.py` (`test_parse_then_read`, `test_parse_batch`, `test_map_cord_*`)
- Real model end-to-end (opt-in): `services/api/tests/test_donut_real.py`
- Quick verify command: `pnpm test:api`
- Full verify command: `cd services/api && RUN_DONUT_REAL=1 .venv/bin/python -m pytest tests/test_donut_real.py -v -s`
- Pass criteria: a dict comes back from a real parse; monkeypatched routes write extracted JSON + manifest

## Related Docs
- [README.md](../../README.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Document Review](document-review.md)
