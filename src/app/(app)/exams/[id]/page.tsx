import { ExamDetailClient } from "./exam-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExamDetailClient id={id} />;
}
