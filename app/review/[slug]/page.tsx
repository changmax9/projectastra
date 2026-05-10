import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, Clock, Layers } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { RelatedQuestions } from "@/components/review/RelatedQuestions";
import { ReviewGuideRenderer } from "@/components/review/ReviewGuideRenderer";
import { extractToc, TableOfContents } from "@/components/review/TableOfContents";
import { getReviewGuideBySlug } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ReviewGuidePage({ params }: { params: { slug: string } }) {
  const guide = await getReviewGuideBySlug(params.slug);
  if (!guide) notFound();
  const toc = extractToc(guide.content_markdown);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[230px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <TableOfContents items={toc} />
            </div>
          </aside>
          <article className="min-w-0">
            <div className="app-surface mb-6 rounded-lg p-6">
              <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand">
                <BookOpen className="h-4 w-4" />
                {guide.subject}
              </p>
              <h1 className="mt-2 text-4xl font-semibold leading-tight text-ink">{guide.title}</h1>
              <p className="mt-3 max-w-3xl leading-7 text-slate-600">{guide.description}</p>
              <div className="mt-5 flex flex-wrap gap-2 text-sm text-slate-600">
                <span className="app-chip inline-flex items-center gap-1 px-3 py-1.5">
                  <Layers className="h-4 w-4" />
                  {guide.unit}
                </span>
                <span className="app-chip px-3 py-1.5">{guide.topic}</span>
                <span className="app-chip px-3 py-1.5">{guide.difficulty}</span>
                <span className="app-chip inline-flex items-center gap-1 px-3 py-1.5">
                  <Clock className="h-4 w-4" />
                  {guide.estimated_reading_time_minutes} min
                </span>
              </div>
            </div>

            <div className="app-surface rounded-lg p-6 sm:p-8">
              <ReviewGuideRenderer content={guide.content_markdown} suppressTitle />
            </div>

            <section className="mt-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-ink">Related practice questions</h2>
                  <p className="text-sm text-slate-500">Questions linked by the admin from the question bank.</p>
                </div>
                <Link href={`/review?topic=${encodeURIComponent(guide.topic)}`} className="app-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold">
                  More guides
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <RelatedQuestions questions={guide.related_questions} />
            </section>
          </article>
        </div>
      </main>
    </>
  );
}
