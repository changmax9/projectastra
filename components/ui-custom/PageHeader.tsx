import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  metadata,
  className
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  metadata?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-5 border-b border-astra-gold/30 pb-6 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="edu-kicker">{eyebrow}</p> : null}
        <h1 className="edu-heading mt-2 text-3xl leading-tight text-astra-navy sm:text-4xl">{title}</h1>
        {description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-astra-slate sm:text-base">{description}</p> : null}
        {metadata ? <div className="mt-4 flex flex-wrap gap-2">{metadata}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
