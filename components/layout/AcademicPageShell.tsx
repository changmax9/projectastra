import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GlassBackground({
  children,
  tone = "portal",
  className
}: {
  children: ReactNode;
  tone?: "public" | "portal" | "exam" | "admin";
  className?: string;
}) {
  return (
    <main
      className={cn(
        "glass-shell min-h-screen",
        tone === "exam" && "bg-white",
        tone === "admin" && "bg-astra-paper",
        className
      )}
    >
      {children}
    </main>
  );
}

export function GlassPageShell({
  children,
  className,
  variant = "student",
  wide = false
}: {
  children: ReactNode;
  className?: string;
  variant?: "student" | "admin" | "exam";
  wide?: boolean;
}) {
  return (
    <GlassBackground tone={variant === "admin" ? "admin" : variant === "exam" ? "exam" : "portal"}>
      <div
        className={cn(
          "mx-auto w-full px-4 py-8 sm:px-6 lg:px-8",
          wide ? "max-w-[1500px]" : "max-w-7xl",
          className
        )}
      >
        {children}
      </div>
    </GlassBackground>
  );
}

export const AcademicBackground = GlassBackground;
export const AcademicPageShell = GlassPageShell;
