"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Laptop, Wifi, X } from "lucide-react";
import styles from "./BluebookDeviceCheck.module.css";

type CheckResult = {
  label: string;
  detail: string;
  status: "ready" | "advisory";
  icon: typeof CheckCircle2;
};

function collectChecks(): CheckResult[] {
  let storageAvailable = false;
  try {
    const key = "astra-device-check";
    window.localStorage.setItem(key, "ready");
    window.localStorage.removeItem(key);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }

  const wideEnough = window.innerWidth >= 768;
  return [
    {
      label: "Internet connection",
      detail: navigator.onLine ? "This browser is currently online." : "Reconnect before starting a timed test.",
      status: navigator.onLine ? "ready" : "advisory",
      icon: Wifi
    },
    {
      label: "Progress storage",
      detail: storageAvailable ? "Browser storage is available for local interface settings." : "Storage is blocked in this browser.",
      status: storageAvailable ? "ready" : "advisory",
      icon: CheckCircle2
    },
    {
      label: "Display workspace",
      detail: wideEnough ? `${window.innerWidth} x ${window.innerHeight} pixels available.` : "A wider laptop or tablet view is recommended for testing.",
      status: wideEnough ? "ready" : "advisory",
      icon: Laptop
    }
  ];
}

export function BluebookDeviceCheck() {
  const [checks, setChecks] = useState<CheckResult[]>([]);

  useEffect(() => {
    setChecks(collectChecks());
  }, []);

  return (
    <Dialog.Root onOpenChange={(open) => open && setChecks(collectChecks())}>
      <Dialog.Trigger asChild>
        <button className={styles.trigger} type="button">
          <Laptop aria-hidden="true" /> Test Your Device
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} data-ud-check="device-check-dialog">
          <header className={styles.dialogHeader}>
            <Dialog.Title>Device Check</Dialog.Title>
            <Dialog.Close className={styles.close} aria-label="Close device check">
              <X aria-hidden="true" />
            </Dialog.Close>
          </header>
          <div className={styles.body}>
            <Dialog.Description>
              Astra can check the browser conditions it uses for practice. Review any advisory before you begin.
            </Dialog.Description>
            <div className={styles.checks} aria-live="polite">
              {checks.map((check) => {
                const Icon = check.icon;
                return (
                  <div className={styles.check} data-status={check.status} key={check.label}>
                    <Icon aria-hidden="true" />
                    <div>
                      <strong>{check.label}</strong>
                      <p>{check.detail}</p>
                    </div>
                    <span className={styles.status}>{check.status === "ready" ? "Ready" : "Review"}</span>
                  </div>
                );
              })}
            </div>
            <p className={styles.note}>
              This browser check does not certify an operating system, battery, native lockdown mode, or official test-day eligibility.
            </p>
          </div>
          <footer className={styles.footer}>
            <Dialog.Close className={styles.done}>Done</Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
