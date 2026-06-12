import type { ElementType, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const toneClass = {
  default: "glass-card text-astra-navy",
  navy: "border-white/20 bg-[rgba(6,18,37,0.90)] text-white shadow-[0_24px_70px_-46px_rgba(6,18,37,0.82)] backdrop-blur-2xl",
  blue: "border-sky-200/70 bg-sky-50/78 text-astra-blue backdrop-blur-2xl",
  gold: "border-amber-200/75 bg-amber-50/80 text-amber-900 backdrop-blur-2xl",
  success: "border-emerald-200/75 bg-emerald-50/82 text-emerald-800 backdrop-blur-2xl",
  danger: "border-rose-200/75 bg-rose-50/82 text-rose-800 backdrop-blur-2xl"
};

export function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "default",
  className
}: {
  label: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
  icon?: ElementType;
  tone?: keyof typeof toneClass;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden rounded-[1.5rem]", toneClass[tone], className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">{label}</p>
            <p className="mt-3 text-3xl font-black tabular-nums">{value}</p>
          </div>
          {Icon ? (
            <span className="flex size-10 items-center justify-center rounded-2xl border border-current/15 bg-white/55 shadow-inner">
              <Icon className="size-5" />
            </span>
          ) : null}
        </div>
        {helper ? <p className="mt-3 text-sm leading-5 opacity-75">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
