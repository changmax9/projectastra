import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/admin/DataTable";
import { getStudentDetail } from "@/lib/data";
import { formatFriendlyDuration, submissionPartLabel, submissionScoreLabel, submissionStatusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminStudentDetailPage({ params }: { params: { id: string } }) {
  const { student, submissions } = await getStudentDetail(params.id);
  if (!student) notFound();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-ink">{student.full_name || student.email}</h1>
        <p className="mt-1 text-sm text-slate-500">{student.email}</p>
      </div>
      <DataTable
        headers={["Exam", "Status", "Score", "Time spent", "Submitted", "Answers"]}
        empty="This student has no submissions."
        rows={submissions.map((submission) => [
          `${submission.exam?.title || submission.exam_id}${submissionPartLabel(submission) ? ` · ${submissionPartLabel(submission)}` : ""}`,
          <span key="status">{submissionStatusLabel(submission.status)}</span>,
          submissionScoreLabel(submission),
          formatFriendlyDuration(submission.time_spent_seconds),
          submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : "Not submitted",
          <Link key="view" href={`/admin/submissions/${submission.id}`} className="font-medium text-brand">View answers</Link>
        ])}
      />
    </div>
  );
}
