import Link from "next/link";
import { CircleHelp, LogOut, Settings, Shield } from "lucide-react";
import { signOutAction } from "@/app/actions";
import { AstraLogo } from "@/components/brand/AstraLogo";
import { getCurrentProfile } from "@/lib/auth";
import styles from "./BluebookAppHeader.module.css";

export async function BluebookAppHeader({ label = "Student Home" }: { label?: string }) {
  const profile = await getCurrentProfile();

  return (
    <header className={styles.header} data-ud-check="student-app-header">
      <div className={styles.inner}>
        <Link className={styles.brand} href={profile ? "/dashboard" : "/login"} aria-label="Astra Exams home">
          <AstraLogo className={styles.brandMark} />
          <span className={styles.brandText}>
            <strong>Astra Exams</strong>
            <span>{label}</span>
          </span>
        </Link>

        {profile ? (
          <nav className={styles.utilities} aria-label="Account and help">
            <Link className={styles.utility} href="/review" title="Help and review resources">
              <CircleHelp aria-hidden="true" />
              <span>Help</span>
            </Link>
            <Link className={styles.utility} href="/settings" title="Account settings">
              <Settings aria-hidden="true" />
              <span>Settings</span>
            </Link>
            {profile.role === "admin" ? (
              <Link className={styles.utility} href="/admin" title="Open administration">
                <Shield aria-hidden="true" />
                <span>Admin</span>
              </Link>
            ) : null}
            <span className={styles.account}>{profile.full_name || profile.email}</span>
            <form action={signOutAction}>
              <button className={styles.signOut} type="submit" title="Sign out" aria-label="Sign out">
                <LogOut aria-hidden="true" />
              </button>
            </form>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
