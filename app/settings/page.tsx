import { Mail, ShieldCheck, UserRound } from "lucide-react";
import { AccountSettingsForm } from "@/components/forms/AccountSettingsForm";
import { DeleteAccountForm } from "@/components/forms/DeleteAccountForm";
import { EmailChangeForm } from "@/components/forms/EmailChangeForm";
import { EmailVerificationForm } from "@/components/forms/EmailVerificationForm";
import { AppHeader } from "@/components/layout/AppHeader";
import { AcademicPageShell } from "@/components/layout/AcademicPageShell";
import { MetricCard } from "@/components/ui-custom/MetricCard";
import { PageHeader } from "@/components/ui-custom/PageHeader";
import { StatusBadge } from "@/components/ui-custom/StatusBadge";
import { DashboardPanel } from "@/components/ui-custom/DashboardPanel";
import { requireProfile } from "@/lib/auth";
import { createSupabaseAdminClient, hasSupabaseEnv } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function getAuthVerification(profileId: string) {
  if (!hasSupabaseEnv()) {
    return {
      emailStatus: "Unknown / Not configured",
      accountStatus: "Active",
      pendingEmail: null
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.getUserById(profileId);
  if (error || !data.user) {
    return {
      emailStatus: "Unknown / Not configured",
      accountStatus: "Active",
      pendingEmail: null
    };
  }

  const pendingEmail = (data.user as { new_email?: string | null }).new_email || null;
  return {
    emailStatus: data.user.email_confirmed_at || data.user.confirmed_at ? "Verified" : "Unverified",
    accountStatus: data.user.banned_until ? "Restricted" : "Active",
    pendingEmail
  };
}

function roleLabel(role: string) {
  return role === "admin" ? "Admin" : "Student";
}

export default async function SettingsPage() {
  const profile = await requireProfile();
  const verification = await getAuthVerification(profile.id);
  const canResendVerification = verification.emailStatus === "Unverified" && hasSupabaseEnv();

  return (
    <>
      <AppHeader />
      <AcademicPageShell className="max-w-6xl">
        <PageHeader
          eyebrow="Account control"
          title="Settings"
          description="Manage your profile details. Role and verification controls are protected server-side."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <MetricCard label="Email" value={profile.email} helper={`Verification: ${verification.emailStatus}`} icon={Mail} />
          <MetricCard label="Role" value={roleLabel(profile.role)} helper="Display-only; authorization stays server-side." icon={ShieldCheck} tone="blue" />
          <MetricCard label="Display name" value={profile.full_name || "Not set"} helper="Shown on your student portal." icon={UserRound} tone="gold" />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-6">
            <AccountSettingsForm fullName={profile.full_name || ""} />
            <EmailChangeForm currentEmail={profile.email} pendingEmail={verification.pendingEmail} />
            <DeleteAccountForm isAdmin={profile.role === "admin"} />
          </div>

          <aside className="flex flex-col gap-6">
            <DashboardPanel title="Account status" description="Read from the current auth profile.">
              <StatusBadge status={verification.accountStatus.toLowerCase()}>{verification.accountStatus}</StatusBadge>
            </DashboardPanel>
            <DashboardPanel title="Email verification" description="Supabase Auth is the source of truth.">
              <div className="flex flex-col gap-3 text-sm leading-6 text-astra-slate">
                <StatusBadge status={verification.emailStatus === "Verified" ? "completed" : verification.emailStatus === "Unverified" ? "pending" : "draft"}>
                  {verification.emailStatus}
                </StatusBadge>
                {verification.emailStatus === "Unknown / Not configured" ? (
                  <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    Email verification is not currently enabled for this project.
                  </p>
                ) : null}
                {canResendVerification ? <EmailVerificationForm /> : null}
              </div>
            </DashboardPanel>
          </aside>
        </div>
      </AcademicPageShell>
    </>
  );
}
