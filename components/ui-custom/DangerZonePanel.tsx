import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DangerZonePanel({
  title,
  description,
  children,
  className
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden rounded-[1.75rem] border-rose-200/80 bg-rose-50/86 text-rose-950 shadow-[0_24px_70px_-52px_rgba(190,18,60,0.42)] backdrop-blur-xl", className)}>
      <CardHeader className="border-b border-rose-200/80 bg-white/35">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-700">Danger Zone</p>
        <div className="text-xl font-semibold leading-none tracking-tight">{title}</div>
        {description ? <CardDescription className="text-rose-800">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}
