import Link from "next/link";
import { BookOpen, Filter, Search } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ReviewGuideCard } from "@/components/review/ReviewGuideCard";
import { listPublishedReviewGuides } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ReviewIndexPage({
  searchParams
}: {
  searchParams: { subject?: string; unit?: string; topic?: string; difficulty?: "easy" | "medium" | "hard" | ""; search?: string };
}) {
  const guides = await listPublishedReviewGuides(searchParams);
  const subjects = Array.from(new Set(guides.map((guide) => guide.subject))).sort();
  const units = Array.from(new Set(guides.map((guide) => guide.unit))).sort();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand">
              <BookOpen className="h-4 w-4" />
              Review Guides
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Study by AP unit</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {guides.length} published guide{guides.length === 1 ? "" : "s"} for quick review and FRQ practice.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {subjects.slice(0, 4).map((subject) => (
              <Link key={subject} href={`/review?subject=${encodeURIComponent(subject)}`} className="app-chip px-3 py-1.5 text-sm font-semibold">
                {subject}
              </Link>
            ))}
          </div>
        </div>

        <form className="app-surface mb-5 grid min-w-0 gap-3 rounded-lg p-4 md:grid-cols-[1fr_170px_170px_140px_112px]">
          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input name="search" defaultValue={searchParams.search || ""} placeholder="Search guides" className="app-field w-full py-2 pl-9 pr-3 text-sm" />
          </label>
          <input name="subject" defaultValue={searchParams.subject || ""} placeholder="Subject" className="app-field w-full min-w-0 px-3 py-2 text-sm" />
          <input name="topic" defaultValue={searchParams.topic || ""} placeholder="Topic" className="app-field w-full min-w-0 px-3 py-2 text-sm" />
          <select name="difficulty" defaultValue={searchParams.difficulty || ""} className="app-field w-full min-w-0 px-3 py-2 text-sm">
            <option value="">All difficulty</option>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
          <button className="app-primary inline-flex w-full min-w-0 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold">
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </form>

        {units.length > 1 ? (
          <div className="mb-6 grid gap-2 sm:flex sm:flex-wrap">
            <Link href="/review" className="app-secondary min-w-0 max-w-full px-3 py-1.5 text-sm font-semibold">
              All units
            </Link>
            {units.slice(0, 10).map((unit) => (
              <Link key={unit} href={`/review?unit=${encodeURIComponent(unit)}`} className="app-secondary min-w-0 max-w-full px-3 py-1.5 text-sm font-semibold">
                <span className="block truncate">{unit}</span>
              </Link>
            ))}
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {guides.map((guide) => (
            <ReviewGuideCard key={guide.id} guide={guide} />
          ))}
          {guides.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 md:col-span-2 xl:col-span-3">
              No published review guides match this filter.
            </p>
          ) : null}
        </div>
      </main>
    </>
  );
}
