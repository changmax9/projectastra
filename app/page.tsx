import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, ClipboardList, GraduationCap, Save, ShieldCheck, Timer } from "lucide-react";
import { HeroVisual } from "@/components/marketing/HeroVisual";
import { FeatureCard } from "@/components/ui-custom/FeatureCard";
import { AppHeader } from "@/components/layout/AppHeader";
import { AcademicBackground } from "@/components/layout/AcademicPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  const startHref = profile ? "/dashboard" : "/register";

  return (
    <>
      <AppHeader />
      <AcademicBackground tone="public">
        <section className="relative overflow-hidden px-4 pb-8 pt-6 sm:px-6 lg:px-8">
          <div className="absolute left-1/2 top-0 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-cyan-300/18 blur-3xl" />
          <div className="glass-panel mx-auto grid max-w-7xl gap-10 rounded-[2.5rem] p-6 sm:p-8 lg:grid-cols-[1.06fr_0.94fr] lg:p-10">
            <div className="flex flex-col justify-center">
              <Badge variant="outline" className="w-fit rounded-full border-white/70 bg-white/64 text-astra-blue backdrop-blur-xl">
                AP EXAM COMMAND CENTER
              </Badge>
              <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[1.02] tracking-[-0.035em] text-astra-navy sm:text-6xl">
                A calm glass cockpit for serious AP practice.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600">
                Astra brings timed sections, structured questions, preserved progress, and review into one focused testing workspace with the clarity of official exam software.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="rounded-full bg-astra-navy text-white shadow-[0_20px_42px_-28px_rgba(6,18,37,0.9)] hover:bg-astra-blue">
                  <Link href={startHref}>
                    {profile ? "Open student portal" : "Create student account"}
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="rounded-full border-white/70 bg-white/62 text-astra-slate backdrop-blur-xl hover:bg-white/85 hover:text-astra-navy">
                  <Link href={profile ? "/available-exams" : "/login"}>{profile ? "Browse exams" : "Log in"}</Link>
                </Button>
              </div>
            </div>
            <HeroVisual signedIn={Boolean(profile)} />
          </div>
        </section>

        <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: Timer, label: "Timed exam sections", value: "Bluebook-style pacing" },
              { icon: Save, label: "Save and resume", value: "Progress is preserved" },
              { icon: CheckCircle2, label: "Structured questions", value: "Text, LaTeX, and figures" }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.label} className="glass-card rounded-[1.5rem]">
                  <CardContent className="flex items-center gap-4 p-5">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-astra-navy text-white shadow-inner">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-astra-navy">{item.label}</p>
                      <p className="text-sm text-astra-slate">{item.value}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <section className="mt-10 grid gap-5 lg:grid-cols-3">
            <FeatureCard
              icon={ClipboardList}
              title="Official exam rhythm"
              description="One exam attempt moves through its sections, break, and results without turning each part into a separate test."
            />
            <FeatureCard
              icon={BookOpen}
              title="Academic review library"
              description="Review guides support Markdown, LaTeX, related practice questions, and focused topic study."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Admin-controlled question bank"
              description="Imported content stays draft/reviewed/published, with structured text and necessary image assets only."
            />
          </section>

          <section className="glass-panel mt-10 rounded-[2.25rem]">
            <div className="grid gap-0 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="navy-band rounded-[2rem] p-8 lg:rounded-r-none">
                <GraduationCap className="size-10 text-astra-gold" />
                <h2 className="mt-5 text-3xl font-black tracking-tight text-astra-warm">Built for AP preparation, not generic quizzes.</h2>
                <p className="mt-4 text-sm leading-7 text-slate-200">
                  The interface keeps the test-taking surface calm while giving students and admins the structure needed for serious practice.
                </p>
              </div>
              <div className="grid gap-4 p-6 sm:grid-cols-2">
                {[
                  "Section-aware timers",
                  "MCQ and FRQ support",
                  "Question images never cropped",
                  "LaTeX math rendering",
                  "Admin review workflow",
                  "Supabase-backed persistence"
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/70 bg-white/78 p-4 font-semibold text-astra-navy shadow-inner">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </AcademicBackground>
    </>
  );
}
