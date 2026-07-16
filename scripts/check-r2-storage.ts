import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { deleteR2Object, r2Buckets, uploadEvidence } from "@/lib/r2";

function loadEnvFile(fileName: string) {
  const filePath = path.join(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function requirePublicEvidenceUrl() {
  const value = requireEnv("R2_EVIDENCE_PUBLIC_URL");
  if (value.includes("<") || value.includes(">")) {
    throw new Error("R2_EVIDENCE_PUBLIC_URL must be the real public r2.dev URL, not a placeholder.");
  }
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("R2_EVIDENCE_PUBLIC_URL must be an http(s) URL.");
  }
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_EVIDENCE_PUBLIC_URL"]) {
    requireEnv(name);
  }
  requirePublicEvidenceUrl();

  const objectKey = `evidence/smoke/${randomUUID()}.txt`;
  let uploaded = false;
  try {
    const url = await uploadEvidence(objectKey, new TextEncoder().encode("astra-r2-smoke"), "text/plain");
    uploaded = true;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`R2 public evidence fetch failed: ${response.status} ${response.statusText}`);
    const body = await response.text();
    if (body.trim() !== "astra-r2-smoke") throw new Error("R2 public evidence fetch returned unexpected content.");
    console.log(`R2 evidence upload/public fetch/delete smoke passed for bucket ${r2Buckets.evidence}.`);
  } finally {
    if (uploaded) await deleteR2Object(r2Buckets.evidence, objectKey);
  }
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const details = [error.message];
  const cause = error.cause;
  if (cause instanceof Error && cause.message && cause.message !== error.message) {
    details.push(`cause: ${cause.message}`);
  } else if (cause && typeof cause === "object") {
    const code = "code" in cause ? String(cause.code) : "";
    const syscall = "syscall" in cause ? String(cause.syscall) : "";
    const hostname = "hostname" in cause ? String(cause.hostname) : "";
    const causeDetails = [code, syscall, hostname].filter(Boolean).join(" ");
    if (causeDetails) details.push(`cause: ${causeDetails}`);
  }
  return details.join(" ");
}

main().catch((error) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
