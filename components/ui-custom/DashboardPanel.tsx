import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DashboardPanel({
  title,
  description,
  action,
  children,
  className,
  contentClassName
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("glass-panel rounded-[1.75rem]", className)}>
      <CardHeader className="flex-row items-start justify-between gap-4 border-b border-white/55 bg-white/24">
        <div>
          <div className="text-base font-semibold leading-none tracking-tight text-astra-navy">{title}</div>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className={cn("p-5", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
