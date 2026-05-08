import Link from "next/link";
import { AdminStatsCards } from "@/components/admin/AdminStatsCards";
import { DataTable } from "@/components/admin/DataTable";
import { getAdminStats } from "@/lib/data";
import { formatFriendlyDuration, submissionPartLabel, submissionScoreLabel, submissionStatusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const stats = await getAdminStats();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Platform overview</h1>
      </div>
      <AdminStatsCards {...stats} />
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
