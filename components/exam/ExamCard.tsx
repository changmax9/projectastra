import Link from "next/link";
import { ArrowRight, Clock, FileQuestion, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export function ExamCard({
  title,
  course,
  year,
  description,
  questionCount,
  timeMinutes,
  sectionCount,
  href,
  inProgress = false
}: {
  title: string;
  course: string;
  year: number | null;
  description: string;
  questionCount: number;
  timeMinutes: number;
  sectionCount: number;
  href: string;
  inProgress?: boolean;
}) {
  return (
    <Card className="group glass-panel relative rounded-[2rem] transition duration-200 hover:-translate-y-0.5 hover:border-sky-200/80 hover:bg-white/82">
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-sky-300/20 blur-2xl" />
      <div className="absolute -bottom-16 left-1/4 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl" />
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-astra-blue">{course}</p>
            <h3 className="mt-2 text-xl font-black leading-tight text-astra-navy">
              <Link href={href}>{title}</Link>
            </h3>
          </div>
          <Badge variant="outline" className="rounded-full border-white/70 bg-white/62 text-astra-slate backdrop-blur-xl">
            {year || "No year"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        <p className="line-clamp-2 text-sm leading-6 text-astra-slate">{description}</p>
        <div className="mt-5 grid gap-2 text-sm text-astra-slate sm:grid-cols-3">
          <span className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-3 py-2 shadow-inner">
            <FileQuestion className="size-4 text-astra-blue" />
            {questionCount} questions
          </span>
          <span className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-3 py-2 shadow-inner">
            <Clock className="size-4 text-astra-blue" />
            {timeMinutes} min
          </span>
          <span className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-3 py-2 shadow-inner">
            <Layers className="size-4 text-astra-blue" />
            {sectionCount} section{sectionCount === 1 ? "" : "s"}
          </span>
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t border-white/55 bg-white/28 px-6 py-4">
        <Badge variant="outline" className={inProgress ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}>
          {inProgress ? "In Progress" : "Ready"}
        </Badge>
        <Button asChild className="rounded-full bg-astra-navy text-white shadow-[0_16px_34px_-24px_rgba(6,18,37,0.9)] hover:bg-astra-blue">
          <Link href={href}>
            {inProgress ? "Resume Exam" : "Start Exam"}
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
