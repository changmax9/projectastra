import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatFriendlyDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  if (seconds < 60) return "Less than 1 min";
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }
  return `${totalMinutes} min`;
}

export function submissionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    in_progress: "In Progress",
    graded: "Completed",
    completed: "Completed",
    submitted: "Submitted",
    paused: "Paused",
    abandoned: "Abandoned"
  };
  return labels[status] || status.replace(/_/g, " ");
}

export function isResumableSubmission(status: string) {
  return status === "in_progress" || status === "paused";
}

export function submissionScoreLabel(submission: {
  status: string;
  total_score: number;
  max_score: number;
  percentage: number;
}) {
  if (submission.status === "submitted") return "Manual grading pending";
  if (submission.max_score <= 0) return "No score yet";
  return `Score: ${submission.total_score}/${submission.max_score} (${submission.percentage}%)`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function nowIso() {
  return new Date().toISOString();
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function percentage(score: number, max: number) {
  if (!max) return 0;
  return Math.round((score / max) * 1000) / 10;
}

export function normalizeText(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export function submissionPartLabel(submission: { section_title?: string | null; section?: string | null }) {
  return submission.section_title || submission.section?.replace(/_/g, " ") || null;
}

export function submissionCurrentSectionLabel(submission: {
  current_section_index?: number;
  sections_progress?: Array<{ sectionTitle: string }> | null;
}) {
  const index = Math.max(0, Number(submission.current_section_index || 0));
  return submission.sections_progress?.[index]?.sectionTitle || null;
}
