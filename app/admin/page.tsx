import Link from "next/link";
import { AdminPdfImportReviewQueue } from "@/components/admin/AdminPdfImportReviewQueue";
import { AdminStatsCards } from "@/components/admin/AdminStatsCards";
import { DataTable } from "@/components/admin/DataTable";
import { getAdminStats } from "@/lib/data";
import { formatFriendlyDuration, submissionPartLabel, submissionScoreLabel, submissionStatusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const stats = await getAdminStats();
  const accountHealth = stats.accountHealth;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Platform overview</h1>
      </div>
      <AdminPdfImportReviewQueue queue={stats.pdfImportReviewQueue} />
      <AdminStatsCards
        {...stats}
        adminsCount={accountHealth.adminProfileCount}
        pdfDraftsPendingCount={stats.pdfImportReviewQueue.pending_draft_count}
      />
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">Account health</h2>
            <p className="mt-1 text-sm text-slate-500">
              {accountHealth.mode === "supabase" ? "Supabase Auth and profile rows" : "Local mock fallback accounts"}
            </p>
          </div>
          <span className={`rounded-md px-3 py-1 text-xs font-semibold ${accountHealth.mode === "supabase" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>
            {accountHealth.mode === "supabase" ? "Supabase connected" : "Mock fallback"}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Admin profiles</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{accountHealth.adminProfileCount}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Student profiles</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{accountHealth.studentProfileCount}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Auth users</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{accountHealth.authUserCount}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Seed admin env</p>
            <p className="mt-1 text-sm font-semibold text-ink">{accountHealth.seedAdminEmailConfigured ? "Configured" : "Missing"}</p>
          </div>
        </div>
        {accountHealth.adminEmails.length > 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            Admin email{accountHealth.adminEmails.length === 1 ? "" : "s"}: {accountHealth.adminEmails.join(", ")}
          </p>
        ) : null}
        {accountHealth.warnings.length > 0 ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Account warnings</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {accountHealth.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <section>
        <h2 className="mb-3 text-xl font-semibold text-ink">Recent submissions</h2>
        <DataTable
          headers={["Student", "Exam", "Status", "Score", "Time", "Open"]}
          empty="No submissions yet."
          rows={stats.recentSubmissions.map((submission) => [
            submission.student?.email || submission.student_id,
            `${submission.exam?.title || submission.exam_id}${submissionPartLabel(submission) ? ` · ${submissionPartLabel(submission)}` : ""}`,
            <span key="status">{submissionStatusLabel(submission.status)}</span>,
            submissionScoreLabel(submission),
            formatFriendlyDuration(submission.time_spent_seconds),
            <Link key="open" href={`/admin/submissions/${submission.id}`} className="font-medium text-brand">View</Link>
          ])}
        />
      </section>
    </div>
  );
}
