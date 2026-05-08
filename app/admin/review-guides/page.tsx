import Link from "next/link";
import { adminDeleteReviewGuideAction } from "@/app/actions";
import { DataTable } from "@/components/admin/DataTable";
import { adminListReviewGuides } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminReviewGuidesPage({
  searchParams
}: {
  searchParams: {
    subject?: string;
    unit?: string;
    topic?: string;
    difficulty?: "easy" | "medium" | "hard" | "";
    status?: "draft" | "published" | "";
    search?: string;
  };
}) {
  const guides = await adminListReviewGuides(searchParams);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Review Guides</h1>
          <p className="mt-1 text-sm text-slate-500">Create, edit, publish, and link guides to practice questions.</p>
        </div>
        <Link href="/admin/review-guides/new" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          New guide
        </Link>
      </div>

      <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_1fr_130px_140px_110px]">
        <input name="search" defaultValue={searchParams.search || ""} placeholder="Search title" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="subject" defaultValue={searchParams.subject || ""} placeholder="Subject" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="topic" defaultValue={searchParams.topic || ""} placeholder="Topic" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <select name="difficulty" defaultValue={searchParams.difficulty || ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">All difficulty</option>
          <option value="easy">easy</option>
          <option value="medium">medium</option>
          <option value="hard">hard</option>
        </select>
        <select name="status" defaultValue={searchParams.status || ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">All status</option>
          <option value="draft">draft</option>
          <option value="published">published</option>
        </select>
        <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">Filter</button>
      </form>

      <DataTable
        headers={["Title", "Subject", "Unit", "Topic", "Difficulty", "Status", "Updated", "Actions"]}
        empty="No review guides found."
        rows={guides.map((guide) => [
          guide.title,
          guide.subject,
          guide.unit,
          guide.topic,
          guide.difficulty,
          <span key="status" className="rounded-full bg-slate-100 px-2 py-1 text-xs uppercase text-slate-500">{guide.status}</span>,
          new Date(guide.updated_at).toLocaleString(),
          <div key="actions" className="flex flex-wrap gap-2">
            <Link href={`/admin/review-guides/${guide.id}/edit`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700">Edit</Link>
            <Link href={`/review/${guide.slug}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700">Preview</Link>
            <form action={adminDeleteReviewGuideAction}>
              <input type="hidden" name="id" value={guide.id} />
              <button className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-danger">Delete</button>
            </form>
          </div>
        ])}
      />
    </div>
  );
}
