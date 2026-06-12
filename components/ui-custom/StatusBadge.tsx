import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  in_progress: "border-amber-200 bg-amber-50 text-amber-800",
  paused: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  graded: "border-emerald-200 bg-emerald-50 text-emerald-800",
  submitted: "border-blue-200 bg-blue-50 text-astra-blue",
  published: "border-emerald-200 bg-emerald-50 text-emerald-800",
  reviewed: "border-blue-200 bg-blue-50 text-astra-blue",
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  failed: "border-rose-200 bg-rose-50 text-rose-800",
  rejected: "border-rose-200 bg-rose-50 text-rose-800",
  "needs-admin-review": "border-amber-200 bg-amber-50 text-amber-900"
};

function titleize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace("Graded", "Completed");
}

export function StatusBadge({
  status,
  children,
  className
}: {
  status: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em]", statusStyles[status] || statusStyles.draft, className)}
    >
      {children || titleize(status)}
    </Badge>
  );
}
