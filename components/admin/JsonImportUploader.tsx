"use client";

import { useState, useTransition } from "react";
import { FileJson, UploadCloud } from "lucide-react";
import { adminImportQuestionBatchAction } from "@/app/actions";
import { parseAdminQuestionImportJson } from "@/lib/ap-question-format";
import type { QuestionImportBatch } from "@/lib/types";

export function JsonImportUploader() {
  const [batch, setBatch] = useState<QuestionImportBatch | null>(null);
  const [errors, setErrors] = useState<Array<{ index: number; path: string; message: string }>>([]);
  const [message, setMessage] = useState("");
  const [sourceFormat, setSourceFormat] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [isPending, startTransition] = useTransition();

  function parseText(text: string) {
    setMessage("");
    setErrors([]);
    setBatch(null);
    setSourceFormat("");
    try {
      const json = JSON.parse(text);
      const result = parseAdminQuestionImportJson(json);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setBatch(result.data);
      setSourceFormat(result.sourceFormat);
    } catch (error) {
      setErrors([{ index: -1, path: "file", message: error instanceof Error ? error.message : "Invalid JSON" }]);
    }
  }

  async function handleFile(file: File) {
    const text = await file.text();
    setRawJson(text);
    parseText(text);
  }

  function importNow() {
    if (!batch) return;
    startTransition(async () => {
      const result = await adminImportQuestionBatchAction(batch);
      setMessage(`Imported ${result.count} question${result.count === 1 ? "" : "s"}.`);
      setBatch(null);
      window.location.href = "/admin/questions";
    });
  }

  const items = batch?.questions || [];
  const imageCount = items.reduce(
    (sum, item) => sum + item.question_images.length + item.choices.filter((choice) => choice.image_url).length,
    0
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white p-8 text-center hover:bg-slate-50">
          <UploadCloud className="h-8 w-8 text-brand" />
          <span className="mt-2 font-medium text-ink">Upload question JSON</span>
          <span className="mt-1 text-sm text-slate-500">AP draft JSON is previewed before import.</span>
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <FileJson className="h-5 w-5 text-brand" />
            <h2 className="font-semibold text-ink">Paste AP draft JSON</h2>
          </div>
          <textarea
            value={rawJson}
            onChange={(event) => setRawJson(event.target.value)}
            rows={10}
            placeholder='[{ "id": "ap-physics1-2023-mcq-01", "examName": "AP Physics 1", ... }]'
            className="w-full rounded-md border border-slate-300 p-3 font-mono text-xs leading-6"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => parseText(rawJson)}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Preview JSON
            </button>
            <button
              type="button"
              onClick={() => {
                setRawJson("");
                setBatch(null);
                setErrors([]);
                setMessage("");
              }}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Clear
            </button>
          </div>
        </section>
      </div>

      {errors.length > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="font-semibold text-red-800">Import blocked: {errors.length} validation error{errors.length === 1 ? "" : "s"}</h3>
          <div className="mt-3 space-y-2 text-sm text-red-700">
            {errors.map((error, index) => (
              <p key={index}>
                Question {error.index >= 0 ? error.index + 1 : "file"} · {error.path}: {error.message}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-ink">Preview {items.length} validated questions</h3>
              <p className="text-sm text-slate-500">
                {sourceFormat === "ap-draft" ? "AP draft JSON converted to structured question records." : "Internal question JSON validated."}
                {batch ? ` ${batch.exam.title} · ${batch.exam.subject} → ${batch.exam.course}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">Questions: {items.length}</span>
              <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">MCQ: {items.filter((item) => item.type === "mcq").length}</span>
              <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">FRQ: {items.filter((item) => item.type === "frq").length}</span>
              <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">Images: {imageCount}</span>
              <span className="rounded-md bg-green-50 px-3 py-1 text-green-700">Errors: 0</span>
              <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">Warnings: 0</span>
            </div>
            <button
              onClick={importNow}
              disabled={isPending}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending ? "Importing..." : "Confirm import"}
            </button>
          </div>
          <div className="mt-4 max-h-[520px] space-y-3 overflow-auto">
            {items.map((item, index) => (
              <div key={`${item.subject}-${index}`} className="rounded-md border border-slate-200 p-3">
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>#{index + 1}</span>
                  <span>{item.subject}</span>
                  <span>{item.unit}</span>
                  <span>{item.topic}</span>
                  <span>{item.type.toUpperCase()}</span>
                  <span>{item.difficulty}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-ink">{item.question_text}</p>
                {item.question_images.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.question_images.map((image) => (
                      <span key={image.id} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                        image: {image.url}
                      </span>
                    ))}
                  </div>
                ) : null}
                {item.choices.length > 0 ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {item.choices.map((choice) => (
                      <div key={choice.id} className="rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700">
                        <span className="font-semibold">{choice.id}.</span> {choice.text}
                        {choice.image_url ? <span className="ml-2 text-slate-400">image attached</span> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {message ? <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div> : null}
    </div>
  );
}
