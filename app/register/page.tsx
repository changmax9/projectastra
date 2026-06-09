import { AppHeader } from "@/components/layout/AppHeader";
import { AuthForm } from "@/components/forms/AuthForm";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <>
      <AppHeader />
      <main className="edu-page flex min-h-[calc(100vh-57px)] items-center px-4 py-10">
        <div className="mx-auto w-full max-w-md">
          <AuthForm mode="register" />
        </div>
      </main>
    </>
  );
}
