import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  FileJson,
  FileText,
  GalleryHorizontal,
  LayoutDashboard,
  ListChecks,
  School,
  Users
} from "lucide-react";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/students", label: "Students", icon: Users },
  { href: "/admin/exams", label: "Exams", icon: School },
  { href: "/admin/questions", label: "Questions", icon: ListChecks },
  { href: "/admin/import", label: "JSON Import", icon: FileJson },
  { href: "/admin/media", label: "Media", icon: GalleryHorizontal },
  { href: "/admin/pdfs", label: "PDFs", icon: FileText },
  { href: "/admin/submissions", label: "Submissions", icon: BarChart3 },
  { href: "/admin/review-guides", label: "Review Guides", icon: BookOpen }
];

export function AdminSidebar() {
  return (
    <aside className="border-b border-slate-200 bg-slate-950 text-white lg:min-h-[calc(100vh-57px)] lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex gap-2 overflow-x-auto px-4 py-3 lg:block lg:space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
