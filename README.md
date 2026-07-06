<!-- last_verified: 2026-07-06 -->
# Donut Receipt Parser

Pull structured data — line items, subtotal, tax, total — out of receipt and
invoice **images** with **no OCR preprocessing step**, and keep every raw
document and every extraction as an auditable trail in
**[Backblaze B2](https://www.backblaze.com/cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-donut-receipt-parser)**.

This sample runs [Donut](https://github.com/clovaai/donut)
(`naver-clova-ix/donut-base-finetuned-cord-v2`) **locally** to read each document
image end-to-end and emit JSON directly — no Tesseract, no cloud OCR, no second
API key. B2 is the single store for both the raw uploaded images
(`raw-documents/`) and the derived structured-data artifacts
(`extracted/<year>/<month>/<doc-id>.json` plus per-run JSONL manifests), all via
the S3-compatible API. It's built for accounting teams, expense platforms, and
logistics operators that want a continuous **ingest → parse → store → serve**
loop where bulk write volume accumulates in B2 as it scales.

**What you get out of the box:**
- OCR-free document extraction with Donut, running on-device (CPU / Apple MPS / CUDA autodetected)
- A scoped Documents library with the full create → parse → review → delete lifecycle
- Human-in-the-loop correction for the fields the model can't infer (merchant, date)
- A pipeline dashboard (documents ingested, parsed, coverage %, recent extractions)
- The reusable B2 scaffolding from the starter kit: full-bucket file explorer + generic upload
- FastAPI backend with strict layered architecture and structural tests
- Agent-optimized docs — your AI coding agent can read the repo and start contributing immediately

## Why B2

Every artifact in the pipeline lives in one bucket over the S3-compatible API:
the raw image you upload, the normalized JSON Donut produces, and a JSONL
manifest per parse run for incremental downstream processing. There is **no
database** — a document's `doc_id` is a deterministic hash of its raw object key,
so `raw-documents/` and `extracted/` correlate directly in B2. As you parse more
documents the extraction corpus grows as durable, queryable object storage.

## Storage layout

```
raw-documents/<submitter>/<type>/<timestamp>-<filename>   # uploaded images (create)
extracted/<year>/<month>/<doc-id>.json                    # normalized + raw extraction (run/edit)
manifests/<run-id>.jsonl                                   # one JSONL object per parse run
```

## Architecture at a glance

The Donut model is contained in the repo layer (`services/api/app/repo/donut_model.py`),
mirroring how `boto3` is contained in `repo/b2_client.py` — the `service/` and
`runtime/` layers never import `transformers` or `torch` directly. See
[ARCHITECTURE.md](ARCHITECTURE.md).

## Quick Start

You need: Node.js >= 20, pnpm >= 9, Python >= 3.11, and a free
**[Backblaze B2 account](https://www.backblaze.com/cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-donut-receipt-parser)**.
No second API key — the Donut weights download once from the public Hugging Face
hub (keyless) and cache locally.

### Setup

**1. Install frontend dependencies**

```bash
pnpm install
```

**2. Set up the backend (core + the Donut ML stack)**

```bash
cd services/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-ml.txt
cd ../..
```

The heavy Donut stack (torch + transformers) lives in `requirements-ml.txt`,
separate from the fast-installing `requirements.txt`. The first parse downloads
~0.8 GB of weights once, then reuses the cache. Model imports are lazy, so the
app boots and the test suite runs without the ML stack installed.

**Device selection is automatic:** the model runs on the first available of
CUDA → Apple MPS → CPU, defaulting to CPU. On MPS, if Donut's `generate` hits an
unsupported op it falls back to CPU for that call. CPU inference of one receipt
takes ~10–30 s but always completes.

**3. Add your B2 credentials**

```bash
cp .env.example .env
```

Open `.env` and, from the [Backblaze B2 dashboard](https://secure.backblaze.com/b2_buckets.htm?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-donut-receipt-parser):

1. **Create a bucket** and set `B2_BUCKET_NAME` and `B2_REGION` (e.g. `us-west-004`).
   The S3 endpoint is derived from the region — no endpoint URL to paste.
2. **Create an application key** with `Read and Write` permission and set
   `B2_APPLICATION_KEY_ID` (keyID) and `B2_APPLICATION_KEY` (applicationKey,
   shown only once).
3. Optionally set `B2_PUBLIC_URL_BASE` if the bucket is public.

> Walkthroughs: [creating a bucket](https://www.backblaze.com/docs/cloud-storage-create-and-manage-buckets?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-donut-receipt-parser) · [creating app keys](https://www.backblaze.com/docs/cloud-storage-create-and-manage-app-keys?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-donut-receipt-parser).

**4. Run it**

```bash
pnpm dev
```

Frontend at `localhost:3000`, API at `localhost:8000`. Go to **Documents**, add a
receipt image, and click **Parse**.

## Using it

1. **Add a document** — on `/documents`, drop a receipt/invoice image, set the
   submitter ID and type (receipt/invoice). It's stored under `raw-documents/`.
2. **Parse** — click Parse on the detail page (or "Parse all unparsed" on the
   list). Donut reads the image and writes `extracted/…json` + a run manifest.
3. **Review & correct** — Donut's CORD model reliably reads line items and
   totals but not the merchant or date; fill those in via "Correct fields". The
   corrected JSON is written back to B2.
4. **Serve** — every extraction is a JSON object in B2 for downstream tools.

## Core Features

- [Document Ingest](docs/features/document-ingest.md) — upload receipt/invoice images to B2
- [Donut Extraction](docs/features/donut-extraction.md) — OCR-free structured-data extraction (the marquee feature)
- [Document Review](docs/features/document-review.md) — human-in-the-loop correction + the structured-data store
- [Dashboard](docs/features/dashboard.md) — pipeline metrics and recent extractions
- [File Upload](docs/features/file-upload.md) — generic drag-and-drop upload (kept from starter)
- [File Browser](docs/features/file-browser.md) — full-bucket explorer (kept from starter)
- [Metadata Extraction](docs/features/metadata-extraction.md) — image/PDF metadata for uploads
- [Design System](docs/design-system.md) — tokens, primitives, error/empty states. Live preview at `/design`.

## Tech Stack

- TypeScript, Next.js 16, React 19, Tailwind v4, shadcn/ui, Recharts
- TanStack Query — caching, dedup, retry for every fetch
- Python 3.11+, FastAPI, boto3, Pydantic v2, Pillow
- **Donut** (`transformers` + `torch`) — OCR-free document understanding, on-device
- Backblaze B2 (S3-compatible object storage)
- pnpm workspaces (monorepo)

## Commands

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Start frontend + backend |
| `pnpm dev:web` | Frontend only |
| `pnpm dev:api` | Backend only |
| `pnpm build` | Build frontend |
| `pnpm lint` | Lint frontend |
| `pnpm lint:api` | Lint backend (ruff) |
| `pnpm test:api` | Run backend tests (Donut monkeypatched — no torch/model needed) |
| `pnpm check:structure` | Verify layering rules |
| `pnpm test:e2e` | Playwright e2e tests (run `pnpm --filter @donut-receipt-parser/web exec playwright install chromium` once first) |

Verify the real model end-to-end (downloads weights):

```bash
cd services/api && RUN_DONUT_REAL=1 .venv/bin/python -m pytest tests/test_donut_real.py -v -s
```

## Documentation Map

| Doc | Purpose |
|-----|---------|
| [AGENTS.md](AGENTS.md) | Agent table of contents — start here |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System layout, layering, data flows |
| [docs/features/](docs/features/) | Feature docs |
| [docs/app-workflows.md](docs/app-workflows.md) | User journeys |
| [docs/dev-workflows.md](docs/dev-workflows.md) | Engineering workflows and testing |
| [docs/SECURITY.md](docs/SECURITY.md) | Security principles |
| [docs/RELIABILITY.md](docs/RELIABILITY.md) | Reliability expectations |

## License

MIT License - see [LICENSE](LICENSE) for details.

## Claude Agent B2 Skill

Manage Backblaze B2 from your terminal using natural language (list/search, audits, stale or large file detection, security checks, safe cleanup).

Repo: [https://github.com/backblaze-b2-samples/claude-skill-b2-cloud-storage](https://github.com/backblaze-b2-samples/claude-skill-b2-cloud-storage)
