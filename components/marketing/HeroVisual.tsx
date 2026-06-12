import { BookOpenCheck, Clock3, FileText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function HeroVisual({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <div className="glass-panel relative rounded-[2.25rem] p-5 text-astra-navy">
      <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="absolute -bottom-16 left-10 h-48 w-48 rounded-full bg-blue-500/15 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3 border-b border-white/60 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-astra-blue">Exam Admission</p>
            <h2 className="mt-1 text-xl font-black text-astra-navy">Astra Academic Portal</h2>
          </div>
          <Badge variant="outline" className="rounded-full border-emerald-200/80 bg-emerald-50/85 text-emerald-800">
            {signedIn ? "Session Ready" : "Student Access"}
          </Badge>
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-white/70 bg-white/72 p-5 shadow-inner backdrop-blur-xl">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: Clock3, label: "Timed Sections", value: "AP-aligned" },
              { icon: BookOpenCheck, label: "Structured Math", value: "KaTeX + Markdown" },
              { icon: FileText, label: "Question Assets", value: "Figures only" },
              { icon: ShieldCheck, label: "Progress", value: "Autosaved" }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-2xl border border-sky-100/90 bg-white/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <Icon className="size-4 text-astra-blue" />
                  <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-astra-slate">{item.label}</p>
                  <p className="mt-1 font-semibold text-astra-navy">{item.value}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-[rgba(6,18,37,0.92)] p-4 text-white shadow-[0_22px_70px_-44px_rgba(6,18,37,0.8)] backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-astra-gold">Next Section</p>
            <span className="font-mono text-sm tabular-nums">60:00</span>
          </div>
          <p className="mt-3 text-lg font-semibold">Multiple Choice - No Calculator</p>
          <div className="mt-4 h-2 rounded-full bg-white/15">
            <div className="h-2 w-2/3 rounded-full bg-gradient-to-r from-astra-cyan to-astra-gold" />
          </div>
        </div>
      </div>
    </div>
  );
}
