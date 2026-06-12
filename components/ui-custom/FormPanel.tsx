import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function FormPanel({
  title,
  description,
  children,
  footer,
  className
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("glass-panel rounded-[1.75rem]", className)}>
      <CardHeader className="border-b border-white/55 bg-white/28">
        <div className="text-base font-semibold leading-none tracking-tight text-astra-navy">{title}</div>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="p-6">{children}</CardContent>
      {footer ? <div className="border-t border-white/55 bg-white/32 px-6 py-4">{footer}</div> : null}
    </Card>
  );
}
