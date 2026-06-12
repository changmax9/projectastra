import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AdminPanelShell({
  title,
  description,
  actions,
  children,
  className
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("admin-surface overflow-hidden rounded-[1.5rem]", className)}>
      <CardHeader className="flex-row items-start justify-between gap-4 border-b border-white/60 bg-white/42">
        <div>
          <div className="text-base font-semibold leading-none tracking-tight text-astra-navy">{title}</div>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}
