import { Mail, ShieldCheck, UserRound } from "lucide-react";
import { AccountSettingsForm } from "@/components/forms/AccountSettingsForm";
import { DeleteAccountForm } from "@/components/forms/DeleteAccountForm";
import { EmailChangeForm } from "@/components/forms/EmailChangeForm";
import { EmailVerificationForm } from "@/components/forms/EmailVerificationForm";
import { AppHeader } from "@/components/layout/AppHeader";
import { requireProfile } from "@/lib/auth";
import { createSupabaseAdminClient, hasSupabaseEnv } from "@/lib/supabase";
import type { ReactNode } from "react";

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

function InfoCard({
  icon,
  label,
  value,
  helper
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="edu-panel rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-950 text-white">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 break-words font-semibold text-ink">{value}</p>
          {helper ? <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p> : null}
        </div>
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const profile = await requireProfile();
  const verification = await getAuthVerification(profile.id);
  const canResendVerification = verification.emailStatus === "Unverified" && hasSupabaseEnv();

  return (
    <>
      <AppHeader />
      <main className="edu-page px-4 py-8 sm:px-6 lg:px-8">
        <div className="edu-shell max-w-5xl space-y-6">
        <div>
          <p className="edu-kicker">Account control</p>
          <h1 className="edu-heading mt-2 text-3xl">Settings</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Manage your profile details. Role and verification controls are protected server-side.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard
            icon={<Mail className="h-5 w-5" />}
            label="Email"
            value={profile.email}
            helper={`Email verification: ${verification.emailStatus}`}
          />
          <InfoCard
            icon={<ShieldCheck className="h-5 w-5" />}
            label="Role"
            value={roleLabel(profile.role)}
            helper="Role changes must be handled by an admin."
          />
          <InfoCard icon={<UserRound className="h-5 w-5" />} label="Display name" value={profile.full_name || "Not set"} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <AccountSettingsForm fullName={profile.full_name || ""} />
            <EmailChangeForm currentEmail={profile.email} pendingEmail={verification.pendingEmail} />
            <DeleteAccountForm isAdmin={profile.role === "admin"} />
          </div>

          <aside className="space-y-4">
            <div className="edu-panel rounded-2xl p-5">
              <h2 className="font-semibold text-slate-950">Account status</h2>
              <p className="mt-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                {verification.accountStatus}
              </p>
            </div>
            <div className="edu-panel rounded-2xl p-5 text-sm leading-6 text-slate-600">
              <h2 className="font-semibold text-slate-950">Email verification</h2>
              <p className="mt-2">
                Email verification status is read from Supabase Auth when available.
              </p>
              {verification.emailStatus === "Verified" ? (
                <p className="mt-3 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                  Verified
                </p>
              ) : null}
              {verification.emailStatus === "Unknown / Not configured" ? (
                <p className="mt-3 rounded-3xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Email verification is not currently enabled for this project.
                </p>
              ) : null}
              {canResendVerification ? <EmailVerificationForm /> : null}
            </div>
          </aside>
        </div>
        </div>
      </main>
    </>
  );
}
