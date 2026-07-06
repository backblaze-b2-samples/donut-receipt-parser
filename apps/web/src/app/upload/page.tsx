import Link from "next/link";

import { UploadForm } from "@/components/upload/upload-form";

export default function UploadPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Upload</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Drag files in or click to browse. Up to 100 MB per file.
        </p>
        <p className="mt-3 max-w-prose rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground text-pretty">
          Uploading a receipt or invoice to parse? Use{" "}
          <Link
            href="/documents"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Documents → Add document
          </Link>{" "}
          instead — files added here are stored in the bucket but are not parsed
          by Donut.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <UploadForm />
      </div>
    </div>
  );
}
