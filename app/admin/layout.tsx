import { AppHeader } from "@/components/layout/AppHeader";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <>
      <AppHeader />
      <div className="lg:flex">
        <AdminSidebar />
        <main className="min-w-0 flex-1 bg-paper px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </>
  );
}
