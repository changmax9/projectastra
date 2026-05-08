import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import type { ComponentProps } from "react";
import { MathMarkdown } from "@/components/MathMarkdown";

function Blockquote(props: ComponentProps<"blockquote">) {
  const text = String(props.children || "");
  const lower = text.toLowerCase();
  let type: "important" | "mistake" | "tip" | undefined;
  if (lower.includes("common mistake:")) type = "mistake";
  else if (lower.includes("exam tip:")) type = "tip";
  else if (lower.includes("important:")) type = "important";

  return (
    <blockquote data-callout={type} {...props}>
      {props.children}
    </blockquote>
  );
}

export function ReviewGuideRenderer({ content }: { content: string }) {
  return (
    <article className="review-prose">
      <MathMarkdown
        content={content}
        rehypePlugins={[rehypeSlug, [rehypeAutolinkHeadings, { behavior: "wrap" }]]}
        components={{
          blockquote: Blockquote,
          a: (props) => <a className="font-medium text-brand underline decoration-blue-200 underline-offset-4" {...props} />,
          ul: (props) => <ul className="ml-6 list-disc space-y-1" {...props} />,
          ol: (props) => <ol className="ml-6 list-decimal space-y-1" {...props} />
        }}
      />
    </article>
  );
}
