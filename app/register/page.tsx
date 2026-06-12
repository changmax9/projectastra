import { AppHeader } from "@/components/layout/AppHeader";
import { AcademicBackground } from "@/components/layout/AcademicPageShell";
import { AuthForm } from "@/components/forms/AuthForm";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <>
      <AppHeader />
      <AcademicBackground tone="public" className="flex min-h-[calc(100vh-88px)] items-center px-4 py-10">
        <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[0.9fr_1fr] lg:items-center">
          <section className="glass-panel hidden rounded-[2.25rem] p-8 lg:block">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-astra-gold">Student registration</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-astra-navy">Create your AP practice account.</h1>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Registration creates a student account only. Confirm your email before signing in and starting timed practice.
            </p>
            <div className="mt-8 rounded-[1.5rem] border border-white/70 bg-white/70 p-5 shadow-inner">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-astra-blue">Verification required</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">New accounts enter the portal after confirming email. Admin roles are never assigned by public registration.</p>
            </div>
          </section>
          <div className="w-full">
            <AuthForm mode="register" />
          </div>
        </div>
      </AcademicBackground>
    </>
  );
}
