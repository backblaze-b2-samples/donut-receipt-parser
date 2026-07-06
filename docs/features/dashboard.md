<!-- last_verified: 2026-07-06 -->
# Feature: Dashboard

## Purpose
Give an at-a-glance overview of the extraction pipeline: how many documents have
been ingested and parsed, coverage, and the most recent extractions.

## Used By
- UI: `/` page (dashboard home)
- API: `GET /documents/stats`, `GET /documents/activity`

## Core Functions
- `apps/web/src/components/dashboard/stats-cards.tsx` — 4 pipeline stat cards
- `apps/web/src/components/dashboard/recent-uploads-table.tsx` — `RecentExtractionsTable` (latest parsed docs)
- `apps/web/src/components/dashboard/upload-chart.tsx` — `IngestChart` (documents added per day)
- `apps/web/src/lib/queries.ts` — `usePipelineStats()`, `useIngestActivity()`
- `services/api/app/runtime/documents.py` — `GET /documents/stats`, `GET /documents/activity`
- `services/api/app/service/documents.py` — `get_pipeline_stats()`, `get_ingest_activity()`
- `services/api/app/repo/b2_client.py` — `list_files()` (paginated S3 listing)

## Canonical Files
- Stat cards: `apps/web/src/components/dashboard/stats-cards.tsx`
- Stats service logic: `services/api/app/service/documents.py`

## Inputs
- None (dashboard loads data automatically)

## Outputs
- `GET /documents/stats` → `PipelineStats` (documents_ingested, documents_parsed, documents_unparsed, parse_coverage, recent_extractions)
- `GET /documents/activity?days=7` → `DailyUploadCount[]` for the ingest chart (server-side aggregation over `raw-documents/`)

## Flow
- Page loads → parallel API calls for pipeline stats and ingest activity
- Stat cards display documents ingested, parsed, parse coverage %, and awaiting parse
- Ingest chart displays documents added per day for the last 7 days as a bar chart
- Recent extractions table shows the latest parsed documents (merchant, type, total, parsed-at), each linking to its detail page

## Edge Cases
- API unavailable → inline error state with retry; the chart does not show a false zero while loading
- No documents → empty chart + empty recent-extractions state; coverage renders 0%
- Large document count → stats paginate through objects via `list_objects_v2`

## UX States
- Loading: skeletons for cards, chart, and table
- Empty: "No extractions yet" / "No activity yet"
- Loaded: populated cards, chart, table

## Verification
- Test files: `services/api/tests/test_documents.py` (`test_pipeline_stats`)
- Required cases: stats with parsed docs, empty bucket, API error fallback
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
