import { AppHeader } from "@/components/layout/AppHeader";
import { AuthForm } from "@/components/forms/AuthForm";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <>
      <AppHeader />
      <main className="flex min-h-[calc(100vh-57px)] items-center bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_28%),#f7f8fb] px-4 py-10">
        <div className="mx-auto w-full max-w-md">
          <AuthForm mode="register" />
        </div>
      </main>
    </>
  );
}
