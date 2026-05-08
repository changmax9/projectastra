import {
  adminDeleteMediaAction,
  adminLinkImageToChoiceAction,
  adminLinkImageToQuestionAction
} from "@/app/actions";
import { MediaUploader } from "@/components/admin/MediaUploader";
import { listMediaFiles, listQuestions } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  const [media, questions] = await Promise.all([listMediaFiles(), listQuestions({})]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Media</h1>
        <p className="mt-1 text-sm text-slate-500">Upload images, copy URLs, and link them to questions or choices.</p>
      </div>
      <MediaUploader />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {media.map((item) => (
          <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.file_url} alt={item.file_name} className="aspect-video w-full rounded-md border border-slate-100 object-contain" />
            <h2 className="mt-3 truncate font-semibold text-ink">{item.file_name}</h2>
            <input readOnly value={item.file_url} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-600" />
            <div className="mt-4 space-y-3">
              <form action={adminLinkImageToQuestionAction} className="flex gap-2">
                <input type="hidden" name="image_url" value={item.file_url} />
                <select name="question_id" required className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-2 text-xs">
                  <option value="">Insert into question_images</option>
                  {questions.map((question) => (
                    <option key={question.id} value={question.id}>{question.topic} · {question.question_text.slice(0, 70)}</option>
                  ))}
                </select>
                <button className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white">Link</button>
              </form>
              <form action={adminLinkImageToChoiceAction} className="grid grid-cols-[1fr_70px_58px] gap-2">
                <input type="hidden" name="image_url" value={item.file_url} />
                <select name="question_id" required className="min-w-0 rounded-md border border-slate-300 px-2 py-2 text-xs">
                  <option value="">Question choice</option>
                  {questions.filter((question) => question.type === "mcq").map((question) => (
                    <option key={question.id} value={question.id}>{question.topic} · {question.question_text.slice(0, 60)}</option>
                  ))}
                </select>
                <input name="choice_id" placeholder="A" className="rounded-md border border-slate-300 px-2 py-2 text-xs" />
                <button className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Set</button>
              </form>
              <form action={adminDeleteMediaAction}>
                <input type="hidden" name="id" value={item.id} />
                <button className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-danger">Delete record</button>
              </form>
            </div>
          </article>
        ))}
        {media.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 md:col-span-2 xl:col-span-3">
            No media uploaded yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
