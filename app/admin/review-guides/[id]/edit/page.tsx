import { notFound } from "next/navigation";
import { ReviewGuideEditor } from "@/components/admin/ReviewGuideEditor";
import { getReviewGuideById, listQuestions } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function EditReviewGuidePage({ params }: { params: { id: string } }) {
  const [guide, questions] = await Promise.all([getReviewGuideById(params.id), listQuestions({})]);
  if (!guide) notFound();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Edit Review Guide</h1>
        <p className="mt-1 text-sm text-slate-500">{guide.title}</p>
      </div>
      <ReviewGuideEditor guide={guide} questions={questions} />
    </div>
  );
}
