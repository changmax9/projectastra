import Link from "next/link";
import { AstraLogo } from "@/components/brand/AstraLogo";
import { AuthForm } from "@/components/forms/AuthForm";
import { BluebookDeviceCheck } from "./BluebookDeviceCheck";
import styles from "./BluebookAuthPage.module.css";

export function BluebookAuthPage({ mode }: { mode: "login" | "register" }) {
  return (
    <main className={styles.page}>
      <header className={styles.topbar} data-ud-check="auth-utility-header">
        <BluebookDeviceCheck />
      </header>
      <section className={styles.main}>
        <div className={styles.stack}>
          <div className={styles.identity}>
            <AstraLogo className={styles.mark} tone="light" />
            <h1>Astra Exams</h1>
            <p>{mode === "login" ? "Take a Test or Start Practicing" : "Create Your Practice Account"}</p>
          </div>
          <div className={styles.panel} data-ud-check="authentication-form">
            <AuthForm mode={mode} />
          </div>
        </div>
      </section>
      <footer className={styles.footer} data-ud-check="auth-footer">
        <span>Astra Exams is an independent AP practice application.</span>
        <Link href={mode === "login" ? "/register" : "/login"}>
          {mode === "login" ? "Need an account?" : "Already registered?"}
        </Link>
      </footer>
    </main>
  );
}
