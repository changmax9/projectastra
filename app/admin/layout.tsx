import { AppHeader } from "@/components/layout/AppHeader";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <>
      <AppHeader />
      <div className="bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_30%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.10),transparent_28%),#f7f8fb] lg:flex">
        <AdminSidebar />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </>
  );
}
