import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MathMarkdown } from "@/components/MathMarkdown";
import { QuestionForm } from "@/components/admin/QuestionForm";
import { QuestionImageAsset } from "@/components/exam/QuestionImageAsset";
import { QuestionRenderer } from "@/components/exam/QuestionRenderer";
import { getQuestion } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminQuestionDetailPage({ params }: { params: { id: string } }) {
  const question = await getQuestion(params.id);
  if (!question) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/questions" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-brand">
          <ArrowLeft className="h-4 w-4" />
          Back to question bank
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-ink">Question detail</h1>
            <p className="mt-1 text-sm text-slate-500">
              {question.subject} · {question.course} · {question.year || "No year"} · {question.section} · {question.topic}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {question.tags.includes("needs-admin-review") ? (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase text-amber-800">
                Needs Review
              </span>
            ) : null}
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase text-slate-500">
              {question.status}
            </span>
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">Student preview</h2>
        <div className="mt-4">
          <QuestionRenderer question={question} />
        </div>
        {question.type === "mcq" ? (
          <div className="mt-5 space-y-3">
            {question.choices.map((choice) => (
              <div key={choice.id} className="flex gap-4 rounded-lg border-2 border-slate-800 bg-white px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-slate-500 text-lg font-bold text-slate-800">
                  {choice.id}
                </span>
                <div className="min-w-0 flex-1 font-serif text-lg leading-8 text-ink">
                  {choice.image_url && /^Option [A-D]$/i.test(choice.text.trim()) ? null : (
                    <MathMarkdown content={choice.text} />
                  )}
                  {choice.image_url ? (
                    <QuestionImageAsset src={choice.image_url} alt={`Choice ${choice.id}`} className="mt-2 w-auto" />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">Images</h2>
        {question.question_images.length === 0 && question.choices.every((choice) => !choice.image_url) ? (
          <p className="mt-2 text-sm text-slate-500">No visual assets attached.</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {question.question_images.map((image) => (
              <figure key={image.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <QuestionImageAsset src={image.url} alt={image.caption || "Question image"} className="w-auto" />
                <figcaption className="mt-2 text-xs text-slate-500">{image.caption || image.url}</figcaption>
              </figure>
            ))}
            {question.choices.filter((choice) => choice.image_url).map((choice) => (
              <figure key={choice.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <QuestionImageAsset src={choice.image_url || ""} alt={`Choice ${choice.id}`} className="w-auto" />
                <figcaption className="mt-2 text-xs text-slate-500">Choice {choice.id}: {choice.image_url}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Edit structured content</h2>
        <QuestionForm question={question} />
      </section>
    </div>
  );
}
