import type { ElementType, ReactNode } from "react";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className
}: {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  icon?: ElementType;
  className?: string;
}) {
  return (
    <div className={cn("glass-panel rounded-[1.75rem] p-8 text-center", className)}>
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/70 bg-white/70 text-astra-blue shadow-inner">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 font-semibold text-astra-navy">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-astra-slate">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ title = "Loading workspace" }: { title?: string }) {
  return (
    <div className="glass-panel rounded-[1.75rem] p-6">
      <div className="flex items-center gap-3 text-sm font-semibold text-astra-slate">
        <Loader2 className="size-4 animate-spin" />
        {title}
      </div>
      <div className="mt-5 grid gap-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action
}: {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-rose-200/80 bg-rose-50/90 p-6 text-rose-900 shadow-[0_18px_48px_-42px_rgba(190,18,60,0.45)] backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0" />
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-6">{description}</p>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
