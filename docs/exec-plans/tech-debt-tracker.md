<!-- last_verified: 2026-03-10 -->
# Tech Debt Tracker

Known tech debt items. Agents update this when they discover or create tech debt.

| Description | Impact | Proposed Resolution | Priority | Status |
|---|---|---|---|---|
| `datetime.utcnow()` deprecated in Python 3.12+ | Naive datetimes, future breakage | Replace with `datetime.now(UTC)` in `repo/b2_client.py`, `service/metadata.py` | High | Resolved |
| S3 client recreated on every API call | Connection pool wasted, added latency | Cache client as module-level singleton via `lru_cache` | High | Resolved |
| `get_upload_stats()` pagination broken at 1000 objects | Stats silently wrong for large buckets | Check `IsTruncated` + use `ContinuationToken` | High | Resolved |
| `record_upload()` never called | `/metrics` always reports 0 uploads | Call from `runtime/upload.py` after successful upload | Medium | Resolved |
| Metrics counters not thread-safe | Race conditions under concurrent requests | Use `threading.Lock` (matches `service/files.py` pattern) | Medium | Resolved |
| `_humanize_bytes` duplicated in Python (repo + service) | DRY violation, drift risk | Extract to `app/types/formatting.py` shared util | Medium | Resolved |
| `humanizeBytes` duplicated in TypeScript | DRY violation | Extract to `lib/utils.ts` | Low | Open |
| `formatDate` duplicated in TypeScript | DRY violation | Extract to `lib/utils.ts` | Low | Open |
| No test harness for feature specs | No automated verification | Add pytest fixtures + test files per feature | Medium | Resolved (partial — tests added for upload, files, activity, errors) |

## 2026-07-06 — verify

UX nitpicks surfaced by the 3-lens verify funnel (backlog only — do not block release):

- `/documents/[docId]` (detail) — a freshly-uploaded receipt's "Original document" card shows a blank box for several seconds (up to ~20s on a brand-new upload) with no skeleton/placeholder, briefly reading as "image unavailable" → recovers on reload and after parse; add a loading skeleton for the presigned-URL image while it fetches (`.local/verify/B/04-detail-unparsed.png`, `.local/verify/r2/C/02-detail-notparsed-receipt.png`).
- `/documents` list vs `/` dashboard — the same merchant-null document renders as its filename in the list "Document" column but as "Unnamed merchant" in the dashboard "Recent Extractions" column → cosmetic null-merchant fallback inconsistency (no data mismatch); pick one fallback label and share it (`.local/verify/C/12-dashboard-final.png`, `.local/verify/r2/C/12-dashboard.png`).
- `/documents/[docId]` (extracted fields) — Total renders raw model output "USD 174.600" (period) beside Subtotal "USD 194,000" (comma), with a default USD label on clearly non-USD amounts → faithful raw Donut/CORD output (correct per the raw-output contract) but could be misread as $174.60; consider a display-only separator/currency normalization while keeping the raw dict intact (`.local/verify/r2/C/04-detail-rawjson-receipt.png`).
- `/documents/[docId]` — "Re-parse" silently overwrites human corrections (merchant/date reset, `Corrected` → No) with no confirmation, unlike Delete's AlertDialog → data-loss footgun on exactly the fields the review step exists to add; gate Re-parse behind a confirm when the doc is already corrected (observed A→B runs; `.local/verify/A/13-after-correct.png`).
