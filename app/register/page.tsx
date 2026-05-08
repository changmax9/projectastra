import { AppHeader } from "@/components/layout/AppHeader";
import { AuthForm } from "@/components/forms/AuthForm";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-4 py-10">
        <AuthForm mode="register" />
      </main>
    </>
  );
}
