import { AppHeader } from "@/components/layout/AppHeader";
import { AcademicBackground } from "@/components/layout/AcademicPageShell";
import { AuthForm } from "@/components/forms/AuthForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <>
      <AppHeader />
      <AcademicBackground tone="public" className="flex min-h-[calc(100vh-88px)] items-center px-4 py-10">
        <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[0.9fr_1fr] lg:items-center">
          <section className="glass-panel hidden rounded-[2.25rem] p-8 lg:block">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-astra-gold">Secure portal</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-astra-navy">Return to your AP workspace.</h1>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Continue saved exam sessions, review results, and access structured study guides from one authenticated account.
            </p>
            <div className="mt-8 rounded-[1.5rem] border border-white/70 bg-[rgba(6,18,37,0.92)] p-5 text-white shadow-[0_22px_70px_-48px_rgba(6,18,37,0.8)]">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-astra-gold">Session protocol</p>
              <p className="mt-3 text-sm leading-6 text-slate-200">Sign in, resume the active section, and keep the exam surface focused.</p>
            </div>
          </section>
          <div className="w-full">
            <AuthForm mode="login" />
          </div>
        </div>
      </AcademicBackground>
    </>
  );
}
