import { ReviewGuideEditor } from "@/components/admin/ReviewGuideEditor";
import { listQuestions } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewReviewGuidePage() {
  const questions = await listQuestions({});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-ink">New Review Guide</h1>
        <p className="mt-1 text-sm text-slate-500">Write Markdown, preview it live, then save as draft or published.</p>
      </div>
      <ReviewGuideEditor questions={questions} />
    </div>
  );
}
