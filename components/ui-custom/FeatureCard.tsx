import type { ElementType, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function FeatureCard({
  icon: Icon,
  title,
  description
}: {
  icon: ElementType;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <Card className="glass-card h-full rounded-[1.5rem] transition duration-200 hover:-translate-y-0.5 hover:border-sky-200/80 hover:bg-white/86">
      <CardContent className="p-5">
        <span className="flex size-11 items-center justify-center rounded-2xl border border-sky-200/80 bg-white/70 text-astra-blue shadow-inner">
          <Icon className="size-5" />
        </span>
        <h3 className="mt-4 font-semibold text-astra-navy">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-astra-slate">{description}</p>
      </CardContent>
    </Card>
  );
}
