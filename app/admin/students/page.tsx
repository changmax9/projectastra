import Link from "next/link";
import { DataTable } from "@/components/admin/DataTable";
import { adminListStudents } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminStudentsPage() {
  const students = await adminListStudents();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Students</h1>
        <p className="mt-1 text-sm text-slate-500">View registration and performance summaries.</p>
      </div>
      <DataTable
        headers={["Name", "Email", "Registered", "Exam count", "Average", "Details"]}
        empty="No students yet."
        rows={students.map((student) => [
          student.full_name || "Unnamed",
          student.email,
          new Date(student.created_at).toLocaleDateString(),
          student.exam_count,
          `${student.average_score}%`,
          <Link key="details" href={`/admin/students/${student.id}`} className="font-medium text-brand">Open</Link>
        ])}
      />
    </div>
  );
}
