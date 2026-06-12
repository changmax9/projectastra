import Link from "next/link";
import { BookOpen, Filter, Search } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AcademicPageShell } from "@/components/layout/AcademicPageShell";
import { ReviewGuideCard } from "@/components/review/ReviewGuideCard";
import { PageHeader } from "@/components/ui-custom/PageHeader";
import { EmptyState } from "@/components/ui-custom/StateBlock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <AcademicPageShell className="flex flex-col gap-7">
        <PageHeader
          eyebrow={<span className="inline-flex items-center gap-2"><BookOpen className="size-4" /> Review Guides</span>}
          title="Study by AP unit"
          description={`${guides.length} published guide${guides.length === 1 ? "" : "s"} for quick review and FRQ practice.`}
          actions={
            <div className="flex flex-wrap gap-2">
            {subjects.slice(0, 4).map((subject) => (
              <Link key={subject} href={`/review?subject=${encodeURIComponent(subject)}`} className="rounded-full border border-white/70 bg-white/64 px-3 py-1.5 text-sm font-semibold text-astra-slate shadow-inner backdrop-blur-xl">
                {subject}
              </Link>
            ))}
            </div>
          }
        />

        <form className="glass-panel grid min-w-0 gap-3 rounded-[1.75rem] p-4 md:grid-cols-[1fr_170px_170px_140px_120px]">
          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
            <Input name="search" defaultValue={searchParams.search || ""} placeholder="Search guides" className="rounded-full border-white/70 bg-white/82 pl-9" />
          </label>
          <Input name="subject" defaultValue={searchParams.subject || ""} placeholder="Subject" className="rounded-full border-white/70 bg-white/82" />
          <Input name="topic" defaultValue={searchParams.topic || ""} placeholder="Topic" className="rounded-full border-white/70 bg-white/82" />
          <select name="difficulty" defaultValue={searchParams.difficulty || ""} className="edu-field w-full min-w-0 rounded-full px-3 py-2 text-sm">
            <option value="">All difficulty</option>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
          <Button className="rounded-full bg-astra-navy text-white hover:bg-astra-blue">
            <Filter data-icon="inline-start" />
            Filter
          </Button>
        </form>

        {units.length > 1 ? (
          <div className="mb-6 grid gap-2 sm:flex sm:flex-wrap">
            <Link href="/review" className="rounded-full border border-white/70 bg-white/64 px-3 py-1.5 text-sm font-semibold text-astra-slate shadow-inner backdrop-blur-xl">
              All units
            </Link>
            {units.slice(0, 10).map((unit) => (
              <Link key={unit} href={`/review?unit=${encodeURIComponent(unit)}`} className="rounded-full border border-white/70 bg-white/64 px-3 py-1.5 text-sm font-semibold text-astra-slate shadow-inner backdrop-blur-xl">
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
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState title="No review guides match this filter" description="Clear the filters or choose another AP unit to continue browsing." />
            </div>
          ) : null}
        </div>
      </AcademicPageShell>
    </>
  );
}
