"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { adminMarkQuestionReviewedAction, adminSaveQuestionAction } from "@/app/actions";
import { MathMarkdown } from "@/components/MathMarkdown";
import { QuestionImageAsset } from "@/components/exam/QuestionImageAsset";
import type { Question, QuestionChoice, QuestionImage } from "@/lib/types";

interface QuestionFormValues {
  exam_name: string;
  subject: string;
  course: string;
  year: number | "";
  section: string;
  exam_type: string;
  question_number: number | "";
  unit: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  type: "mcq" | "frq";
  question_text: string;
  choices_json: string;
  question_images_json: string;
  correct_answer: string;
  explanation: string;
  source_pdf: string;
  tags: string;
  status: "draft" | "reviewed" | "published";
  points: number;
  time_estimate_seconds: number | "";
}

export function QuestionForm({ question }: { question?: Question }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit, watch } = useForm<QuestionFormValues>({
    defaultValues: {
      subject: question?.subject || "Physics",
      exam_name: question?.exam_name || question?.course || "AP Physics 1",
      course: question?.course || "AP Physics 1",
      year: question?.year || "",
      section: question?.section || (question?.type === "frq" ? "FRQ" : "MCQ"),
      exam_type: question?.exam_type || "Practice Exam",
      question_number: question?.question_number || "",
      unit: question?.unit || "",
      topic: question?.topic || "",
      difficulty: question?.difficulty || "medium",
      type: question?.type || "mcq",
      question_text: question?.question_text || "",
      choices_json: JSON.stringify(question?.choices || [
        { id: "A", text: "", image_url: null },
        { id: "B", text: "", image_url: null },
        { id: "C", text: "", image_url: null },
        { id: "D", text: "", image_url: null }
      ], null, 2),
      question_images_json: JSON.stringify(question?.question_images || [], null, 2),
      correct_answer: question?.correct_answer || "",
      explanation: question?.explanation || "",
      source_pdf: question?.source_pdf || "",
      tags: question?.tags.join(", ") || "",
      status: question?.status || "draft",
      points: question?.points || 1,
      time_estimate_seconds: question?.time_estimate_seconds || ""
    }
  });
  const type = watch("type");
  const previewText = watch("question_text");
  const previewExplanation = watch("explanation");
  const previewChoicesJson = watch("choices_json");
  const previewImagesJson = watch("question_images_json");

  function parseJsonPreview<T>(value: string, fallback: T): T {
    try {
      return JSON.parse(value || "") as T;
    } catch {
      return fallback;
    }
  }

  const previewChoices = parseJsonPreview<QuestionChoice[]>(previewChoicesJson, []);
  const previewImages = parseJsonPreview<QuestionImage[]>(previewImagesJson, []);
  const needsReview = question?.tags.includes("needs-admin-review");

  function buildFormData(values: QuestionFormValues, intent: string) {
    const formData = new FormData();
    if (question?.id) formData.set("id", question.id);
    Object.entries(values).forEach(([key, value]) => formData.set(key, String(value)));
    formData.set("intent", intent);
    return formData;
  }

  function submitValues(values: QuestionFormValues, intent: "save" | "save-draft" | "mark-reviewed") {
    setMessage("");
    setError("");
    startTransition(async () => {
      const formData = buildFormData(values, intent);
      const result =
        intent === "mark-reviewed"
          ? await adminMarkQuestionReviewedAction({}, formData)
          : await adminSaveQuestionAction({}, formData);
      if (result?.error) setError(result.error);
      else {
        setMessage(result?.message || (intent === "save-draft" ? "Draft saved." : "Saved."));
        router.refresh();
      }
    });
  }

  return (
    <form
      className="edu-panel space-y-4 rounded-2xl p-5"
      onSubmit={handleSubmit((values) => submitValues(values, "save"))}
    >
      {needsReview ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          Needs Review
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">
          Exam name
          <input className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100" {...register("exam_name", { required: true })} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Subject
          <input className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100" {...register("subject", { required: true })} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          AP Course
          <input className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100" {...register("course", { required: true })} />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          Year
          <input type="number" min={1900} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("year")} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Section
          <select className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("section")}>
            <option value="MCQ">MCQ</option>
            <option value="FRQ">FRQ</option>
            <option value="MCQ_NON_CALCULATOR">MCQ Non-Calculator</option>
            <option value="MCQ_CALCULATOR">MCQ Calculator</option>
            <option value="FRQ_CALCULATOR">FRQ Calculator</option>
            <option value="FRQ_NON_CALCULATOR">FRQ Non-Calculator</option>
            <option value="Full Exam">Full Exam</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Exam type
          <select className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("exam_type")}>
            <option value="Practice Exam">Practice Exam</option>
            <option value="Released Exam">Released Exam</option>
            <option value="Unit Test">Unit Test</option>
            <option value="Custom Quiz">Custom Quiz</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Question #
          <input type="number" min={1} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("question_number")} />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Unit
          <input className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("unit", { required: true })} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Topic
          <input className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("topic", { required: true })} />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          Difficulty
          <select className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("difficulty")}>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Type
          <select className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("type")}>
            <option value="mcq">mcq</option>
            <option value="frq">frq</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Points
          <input type="number" min={1} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("points")} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Seconds
          <input type="number" min={1} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("time_estimate_seconds")} />
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Question text
        <textarea rows={5} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("question_text", { required: true })} />
      </label>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Choices JSON {type === "frq" ? "(must be [])" : ""}
          <textarea rows={8} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100 font-mono text-xs" {...register("choices_json")} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Question images JSON
          <textarea rows={8} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100 font-mono text-xs" {...register("question_images_json")} />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          Correct answer
          <input className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" placeholder={type === "mcq" ? "A" : "leave blank"} {...register("correct_answer")} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Tags
          <input className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" placeholder="work, energy" {...register("tags")} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Source PDF
          <input className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("source_pdf")} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Status
          <select className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("status")}>
            <option value="draft">draft</option>
            <option value="reviewed">reviewed</option>
            <option value="published">published</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Explanation
        <textarea rows={4} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100" {...register("explanation", { required: true })} />
      </label>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-ink">MathMarkdown preview</h3>
        <div className="mt-4 rounded-xl border border-slate-100 bg-white p-4">
          <div className="exam-prose font-serif text-lg leading-8 text-ink">
            <MathMarkdown content={previewText || ""} />
          </div>
          {previewImages.length > 0 ? (
            <div className="mt-4 space-y-3">
              {previewImages.map((image) => (
                <figure key={image.id} className="rounded-3xl border border-slate-200 bg-white p-3">
                  <QuestionImageAsset src={image.url} alt={image.alt || image.caption || "Question image"} className="w-auto" />
                  <figcaption className="mt-2 text-xs text-slate-500">{image.caption || image.alt || image.url}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
          {type === "mcq" && previewChoices.length > 0 ? (
            <div className="mt-4 space-y-3">
              {previewChoices.map((choice) => (
                <div key={choice.id} className="flex gap-3 rounded-3xl border border-slate-200 p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-slate-500 font-bold">{choice.id}</span>
                  <div className="min-w-0 flex-1">
                    <div className="exam-prose font-serif text-base leading-7">
                      <MathMarkdown content={choice.text || ""} />
                    </div>
                    {choice.image_url ? <QuestionImageAsset src={choice.image_url} alt={`Choice ${choice.id}`} className="mt-2 w-auto" /> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {previewExplanation ? (
            <div className="exam-prose mt-4 border-t border-slate-200 pt-4 text-sm leading-7 text-slate-700">
              <MathMarkdown content={previewExplanation} />
            </div>
          ) : null}
        </div>
      </section>
      {error ? <div className="rounded-3xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-3xl border border-green-100 bg-green-50 p-3 text-sm text-green-700">{message}</div> : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={handleSubmit((values) => submitValues(values, "save-draft"))}
          className="edu-button-secondary px-5 py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save Draft"}
        </button>
        <button disabled={isPending} className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60">
          {isPending ? "Saving..." : "Save question"}
        </button>
        {question?.id ? (
          <button
            type="button"
            disabled={isPending}
            onClick={handleSubmit((values) => submitValues(values, "mark-reviewed"))}
            className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-emerald-900/10 transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:opacity-60"
          >
            {isPending ? "Saving..." : "Mark as Reviewed"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
