import { MathMarkdown } from "@/components/MathMarkdown";
import { QuestionImageAsset } from "@/components/exam/QuestionImageAsset";
import type { Question } from "@/lib/types";

export function QuestionRenderer({ question }: { question: Question }) {
  return (
    <div className="space-y-5">
      <div className="exam-prose font-serif text-xl leading-9 text-ink">
        <MathMarkdown content={question.question_text} />
      </div>
      {question.question_images.length > 0 ? (
        <div className="space-y-4">
          {question.question_images.map((image) => (
            <figure key={image.id} className="flex flex-col items-start">
              <QuestionImageAsset
                src={image.url}
                alt={image.caption || "Question image"}
              />
              {image.caption ? <figcaption className="mt-2 text-xs text-slate-500">{image.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}
