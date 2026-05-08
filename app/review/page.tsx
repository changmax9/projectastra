import { Search } from "lucide-react";
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

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">Review Guides</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">Study like an online textbook</h1>
        </div>

        <form className="mb-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_180px_150px_120px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input name="search" defaultValue={searchParams.search || ""} placeholder="Search guides" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
          </label>
          <input name="subject" defaultValue={searchParams.subject || ""} placeholder="Subject" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input name="topic" defaultValue={searchParams.topic || ""} placeholder="Topic" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <select name="difficulty" defaultValue={searchParams.difficulty || ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">All difficulty</option>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
          <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Filter</button>
        </form>

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
