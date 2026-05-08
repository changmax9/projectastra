import Link from "next/link";
import { DataTable } from "@/components/admin/DataTable";
import { adminListSubmissions, adminListExams, adminListStudents } from "@/lib/data";
import { formatFriendlyDuration, submissionPartLabel, submissionScoreLabel, submissionStatusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminSubmissionsPage({
  searchParams
}: {
  searchParams: { exam?: string; student?: string };
}) {
  const [submissions, exams, students] = await Promise.all([adminListSubmissions(), adminListExams(), adminListStudents()]);
  const filtered = submissions.filter((submission) => {
    if (searchParams.exam && submission.exam_id !== searchParams.exam) return false;
    if (searchParams.student && submission.student_id !== searchParams.student) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Submissions</h1>
        <p className="mt-1 text-sm text-slate-500">Filter by exam or student, then open answer-level detail.</p>
      </div>
      <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_120px]">
        <select name="exam" defaultValue={searchParams.exam || ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">All exams</option>
          {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
        </select>
        <select name="student" defaultValue={searchParams.student || ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">All students</option>
          {students.map((student) => <option key={student.id} value={student.id}>{student.email}</option>)}
        </select>
        <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">Filter</button>
      </form>
      <DataTable
        headers={["Student", "Exam", "Status", "Score", "Time", "Submitted", "Open"]}
        empty="No matching submissions."
        rows={filtered.map((submission) => [
          submission.student?.email || submission.student_id,
          `${submission.exam?.title || submission.exam_id}${submissionPartLabel(submission) ? ` · ${submissionPartLabel(submission)}` : ""}`,
          <span key="status">{submissionStatusLabel(submission.status)}</span>,
          submissionScoreLabel(submission),
          formatFriendlyDuration(submission.time_spent_seconds),
          submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : "In progress",
          <Link key="open" href={`/admin/submissions/${submission.id}`} className="font-medium text-brand">Detail</Link>
        ])}
      />
    </div>
  );
}
