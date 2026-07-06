<!-- last_verified: 2026-07-06 -->
# App Workflows

User journeys inside the application. The primary journey is the document
pipeline; the generic upload/browse journeys are the reusable starter surface.

## Document pipeline: ingest → parse → review → serve

- **Ingest.** User navigates to `/documents` and clicks **Add document**.
  - Drops a receipt/invoice image, enters a Submitter ID (free text, e.g.
    `acct-team-01`), and picks a Document type (Select: Receipt / Invoice,
    default Receipt).
  - On submit the image is stored in B2 under
    `raw-documents/<submitter>/<type>/<timestamp>-<filename>` and appears in the
    list as **Not parsed**.
- **Parse.** User opens a document (`/documents/[docId]`) and clicks **Parse**
  (or **Parse all unparsed** on the list to batch every pending document).
  - Donut reads the image on-device and the app writes
    `extracted/<year>/<month>/<doc-id>.json` plus a run manifest.
  - The detail view shows the original image beside the normalized fields
    (line items, subtotal, tax, total) and the raw Donut JSON in a tab.
- **Review.** Donut's CORD model can't reliably read the merchant or date, so
  those start null. User clicks **Correct fields**, fills in merchant/date,
  picks currency (Select), adjusts totals if needed, and saves — the corrected
  JSON is written back to B2 and flagged `corrected`.
- **Serve.** Every extraction is a JSON object in B2; the dashboard summarizes
  the pipeline and downstream tools consume `extracted/**` and the manifests.
- **Delete.** From the detail page, **Delete** (with a confirm dialog) removes
  the raw image and the extracted JSON for that document only.
- See: [Document Ingest](features/document-ingest.md),
  [Donut Extraction](features/donut-extraction.md),
  [Document Review](features/document-review.md)

## View Pipeline Dashboard

- User navigates to `/` (home).
- Stat cards show documents ingested, documents parsed, parse coverage %, and
  documents awaiting parse.
- The ingest chart shows documents added per day over the last 7 days.
- The recent extractions table shows the latest parsed documents (merchant,
  type, total, parsed-at).
- See: [Dashboard](features/dashboard.md)

## Upload Files (generic starter surface)

- User navigates to `/upload`
- Drops or selects files in the dropzone
- Client validates file size (max 100MB) and type
- Progress bar shows per-file upload status
- On success: toast notification, green checkmark
- On failure: red status icon with error message
- User can clear completed uploads
- See: [File Upload](features/file-upload.md)

## Browse and Manage Files

- User navigates to `/files`
- Page loads file list from API (sorted most recent first)
- Files displayed in tree view with folders and type-specific icons
- Top-level folders auto-expand on load
- Hover a file row to see action buttons (preview / download / delete)
- **Preview**: opens dialog with image/PDF preview + metadata panel
- **Download**: fetches presigned URL, browser downloads file
- **Delete**: removes file from B2, row removed from tree, toast confirms
- Empty bucket shows "No files found" with upload prompt
- See: [File Browser](features/file-browser.md)

The full-bucket `/files` explorer ("browse the whole bucket") and the scoped
`/documents` library ("manage this app's receipts") coexist: `/files` shows
every object including `raw-documents/`, `extracted/`, and `manifests/`, while
`/documents` presents them as tracked documents with parse status.
