import Link from "next/link";
import { AdminPdfImportReviewQueue } from "@/components/admin/AdminPdfImportReviewQueue";
import { AdminPanelShell } from "@/components/admin/AdminPanelShell";
import { AdminStatsCards } from "@/components/admin/AdminStatsCards";
import { DataTable } from "@/components/admin/DataTable";
import { PageHeader } from "@/components/ui-custom/PageHeader";
import { StatusBadge } from "@/components/ui-custom/StatusBadge";
import { getAdminStats } from "@/lib/data";
import { formatFriendlyDuration, submissionPartLabel, submissionScoreLabel, submissionStatusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const stats = await getAdminStats();
  const accountHealth = stats.accountHealth;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin console"
        title="Platform overview"
        description="Monitor accounts, question-bank health, PDF imports, and recent exam activity."
      />
      <AdminPdfImportReviewQueue queue={stats.pdfImportReviewQueue} />
      <AdminStatsCards
        {...stats}
        adminsCount={accountHealth.adminProfileCount}
        pdfDraftsPendingCount={stats.pdfImportReviewQueue.pending_draft_count}
      />
      <AdminPanelShell title="Account health" description={accountHealth.mode === "supabase" ? "Supabase Auth and profile rows" : "Local mock fallback accounts"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-950">Authentication and profile rows</h2>
            <p className="mt-1 text-sm text-slate-500">
              {accountHealth.mode === "supabase" ? "Supabase Auth and profile rows" : "Local mock fallback accounts"}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${accountHealth.mode === "supabase" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>
            {accountHealth.mode === "supabase" ? "Supabase connected" : "Mock fallback"}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[1.25rem] border border-white/70 bg-white/78 p-3 shadow-inner">
            <p className="text-xs uppercase tracking-wide text-slate-500">Admin profiles</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{accountHealth.adminProfileCount}</p>
          </div>
          <div className="rounded-[1.25rem] border border-white/70 bg-white/78 p-3 shadow-inner">
            <p className="text-xs uppercase tracking-wide text-slate-500">Student profiles</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{accountHealth.studentProfileCount}</p>
          </div>
          <div className="rounded-[1.25rem] border border-white/70 bg-white/78 p-3 shadow-inner">
            <p className="text-xs uppercase tracking-wide text-slate-500">Auth users</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{accountHealth.authUserCount}</p>
          </div>
          <div className="rounded-[1.25rem] border border-white/70 bg-white/78 p-3 shadow-inner">
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
      </AdminPanelShell>
      <section>
        <h2 className="edu-kicker mb-3">Recent submissions</h2>
        <DataTable
          headers={["Student", "Exam", "Status", "Score", "Time", "Open"]}
          empty="No submissions yet."
          rows={stats.recentSubmissions.map((submission) => [
            submission.student?.email || submission.student_id,
            `${submission.exam?.title || submission.exam_id}${submissionPartLabel(submission) ? ` · ${submissionPartLabel(submission)}` : ""}`,
            <StatusBadge key="status" status={submission.status}>{submissionStatusLabel(submission.status)}</StatusBadge>,
            submissionScoreLabel(submission),
            formatFriendlyDuration(submission.time_spent_seconds),
            <Link key="open" href={`/admin/submissions/${submission.id}`} className="font-medium text-brand">View</Link>
          ])}
        />
      </section>
    </div>
  );
}
