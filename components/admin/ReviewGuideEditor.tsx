"use client";

import { useMemo, useState } from "react";
import { Eye, Save } from "lucide-react";
import { adminSaveReviewGuideAction } from "@/app/actions";
import { ReviewGuideRenderer } from "@/components/review/ReviewGuideRenderer";
import { QuestionPicker } from "@/components/admin/QuestionPicker";
import { slugify } from "@/lib/utils";
import type { Question, ReviewGuideWithQuestions } from "@/lib/types";

export function ReviewGuideEditor({
  guide,
  questions
}: {
  guide?: ReviewGuideWithQuestions;
  questions: Question[];
}) {
  const [title, setTitle] = useState(guide?.title || "");
  const [slug, setSlug] = useState(guide?.slug || "");
  const [markdown, setMarkdown] = useState(guide?.content_markdown || "# New Review Guide\n\n## Big Idea\n\nStart writing...");
  const selectedIds = useMemo(() => guide?.related_questions.map((question) => question.id) || [], [guide]);

  return (
    <form action={adminSaveReviewGuideAction} className="space-y-5">
      {guide?.id ? <input type="hidden" name="id" value={guide.id} /> : null}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Title
            <input
              required
              name="title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (!guide?.id) setSlug(slugify(event.target.value));
              }}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Slug
            <input
              required
              name="slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <input name="subject" defaultValue={guide?.subject || "AP Physics 1"} placeholder="Subject" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input name="unit" defaultValue={guide?.unit || ""} placeholder="Unit" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input name="topic" defaultValue={guide?.topic || ""} placeholder="Topic" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <select name="difficulty" defaultValue={guide?.difficulty || "medium"} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </div>
        <textarea
          name="description"
          defaultValue={guide?.description || ""}
          placeholder="Short description"
          rows={2}
          className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <select name="status" defaultValue={guide?.status || "draft"} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="draft">draft</option>
            <option value="published">published</option>
          </select>
          <input name="estimated_reading_time_minutes" type="number" min={1} defaultValue={guide?.estimated_reading_time_minutes || 8} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input name="cover_image_url" defaultValue={guide?.cover_image_url || ""} placeholder="Cover image URL" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Save className="h-5 w-5 text-brand" />
            <h2 className="font-semibold text-ink">Markdown editor</h2>
          </div>
          <textarea
            name="content_markdown"
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            rows={28}
            className="w-full rounded-md border border-slate-300 p-4 font-mono text-sm leading-7"
          />
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Eye className="h-5 w-5 text-brand" />
            <h2 className="font-semibold text-ink">Live preview</h2>
          </div>
          <div className="max-h-[760px] overflow-auto rounded-md border border-slate-100 bg-paper p-5">
            <ReviewGuideRenderer content={markdown} />
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-ink">Related practice questions</h2>
        <p className="mb-3 text-sm text-slate-500">Selected questions appear at the bottom of the student reading page.</p>
        <QuestionPicker questions={questions} selectedIds={selectedIds} />
      </section>

      <div className="flex flex-wrap gap-3">
        <button className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Save guide</button>
        {guide?.slug ? (
          <a href={`/review/${guide.slug}`} target="_blank" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Preview as student
          </a>
        ) : null}
      </div>
    </form>
  );
}
