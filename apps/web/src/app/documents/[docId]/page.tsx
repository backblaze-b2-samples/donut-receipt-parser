import { DocumentDetail } from "@/components/documents/document-detail";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const { docId } = await params;
  return (
    <div className="animate-fade-in">
      <DocumentDetail docId={docId} />
    </div>
  );
}
