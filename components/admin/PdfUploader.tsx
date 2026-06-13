"use client";

import { FormEvent, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { adminUploadPdfAction, type ActionState } from "@/app/actions";

type MultipartState = { pdfId: string; objectKey: string; uploadId: string; partSize: number };

async function jsonRequest<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "PDF upload request failed.");
  return payload as T;
}

async function uploadPartWithRetries(state: MultipartState, file: File, partNumber: number, partSize: number) {
  const start = (partNumber - 1) * partSize;
  const chunk = file.slice(start, Math.min(file.size, start + partSize));
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { url } = await jsonRequest<{ url: string }>("/api/admin/pdf-uploads/multipart/part", {
        pdfId: state.pdfId,
        uploadId: state.uploadId,
        partNumber
      });
      const response = await fetch(url, { method: "PUT", body: chunk });
      if (!response.ok) throw new Error(`Part ${partNumber} failed with status ${response.status}.`);
      const etag = response.headers.get("etag");
      if (!etag) throw new Error(`Part ${partNumber} did not return an ETag. Check R2 bucket CORS exposed headers.`);
      return { partNumber, etag };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Part ${partNumber} failed after 3 attempts.`);
}

function LocalUploadButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Uploading..." : "Upload source PDF"}</button>;
}

function LocalPdfUploader() {
  const [state, action] = useFormState<ActionState, FormData>(adminUploadPdfAction, {});
  return (
    <form action={action} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-ink">Upload source PDF</h2>
        <p className="text-sm text-slate-500">Local mode stores the PDF with the website and runs the configured local OCR runtime.</p>
      </div>
      <input required type="file" name="file" accept="application/pdf" className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <div className="grid gap-3 md:grid-cols-3">
        <input name="subject" placeholder="AP Course" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="unit" placeholder="Unit" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="topic" placeholder="Topic" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <LocalUploadButton />
      {state.error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</p> : null}
      {state.message ? <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">{state.message}</p> : null}
    </form>
  );
}

function RemotePdfUploader() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "uploading" | "completed" | "failed">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) return;
    const uploadFile = file;
    setStatus("uploading");
    setProgress(0);
    setMessage("Starting resumable upload...");
    let multipart: MultipartState | null = null;
    try {
      multipart = await jsonRequest<MultipartState>("/api/admin/pdf-uploads/multipart/create", {
        fileName: uploadFile.name,
        fileSize: uploadFile.size,
        contentType: uploadFile.type,
        subject: String(data.get("subject") || ""),
        unit: String(data.get("unit") || ""),
        topic: String(data.get("topic") || "")
      });
      const partCount = Math.ceil(uploadFile.size / multipart.partSize);
      const results: Array<{ partNumber: number; etag: string }> = [];
      let cursor = 1;
      async function worker() {
        while (cursor <= partCount) {
          const partNumber = cursor;
          cursor += 1;
          results.push(await uploadPartWithRetries(multipart!, uploadFile, partNumber, multipart!.partSize));
          setProgress(Math.round(results.length / partCount * 100));
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, partCount) }, () => worker()));
      await jsonRequest("/api/admin/pdf-uploads/multipart/complete", {
        pdfId: multipart.pdfId,
        uploadId: multipart.uploadId,
        parts: results
      });
      setStatus("completed");
      setMessage(`Uploaded ${uploadFile.name}. It is ready for OCR analysis.`);
      form.reset();
      router.refresh();
    } catch (error) {
      if (multipart) {
        await jsonRequest("/api/admin/pdf-uploads/multipart/abort", { pdfId: multipart.pdfId, uploadId: multipart.uploadId }).catch(() => undefined);
      }
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unable to upload PDF.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-ink">Upload source PDF</h2>
        <p className="text-sm text-slate-500">Large PDFs upload directly to durable storage in resumable 10 MB parts.</p>
      </div>
      <input required disabled={status === "uploading"} type="file" name="file" accept="application/pdf" className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <div className="grid gap-3 md:grid-cols-3">
        <input name="subject" placeholder="AP Course" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="unit" placeholder="Unit" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="topic" placeholder="Topic" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      {status === "uploading" ? (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-700" style={{ width: `${progress}%` }} /></div>
          <p className="mt-2 text-sm text-slate-600">{message} {progress}%</p>
        </div>
      ) : null}
      <button disabled={status === "uploading"} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
        {status === "uploading" ? "Uploading..." : "Upload source PDF"}
      </button>
      {status === "failed" ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}
      {status === "completed" ? <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">{message}</p> : null}
    </form>
  );
}

export function PdfUploader({ remoteEnabled }: { remoteEnabled: boolean }) {
  return remoteEnabled ? <RemotePdfUploader /> : <LocalPdfUploader />;
}
