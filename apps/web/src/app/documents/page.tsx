import { DocumentsView } from "@/components/documents/documents-view";

export default function DocumentsPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Documents</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Your receipt and invoice library, scoped to this app&apos;s{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">raw-documents/</code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">extracted/</code>{" "}
          prefixes in Backblaze B2. Parse a document to extract structured data with Donut.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <DocumentsView />
      </div>
    </div>
  );
}
