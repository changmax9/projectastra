import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { Children, isValidElement } from "react";
import type { ComponentProps, ReactNode } from "react";
import { MathMarkdown } from "@/components/MathMarkdown";

function childrenToText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement(child)) return childrenToText(child.props.children);
      return "";
    })
    .join(" ");
}

function Blockquote(props: ComponentProps<"blockquote">) {
  const text = childrenToText(props.children);
  const lower = text.toLowerCase();
  let type: "important" | "mistake" | "tip" | "visual" | undefined;
  if (lower.includes("common mistake:")) type = "mistake";
  else if (lower.includes("exam tip:")) type = "tip";
  else if (lower.includes("important:")) type = "important";
  else if (lower.includes("visual cue:")) type = "visual";

  return (
    <blockquote data-callout={type} {...props}>
      {props.children}
    </blockquote>
  );
}

export function ReviewGuideRenderer({ content, suppressTitle = false }: { content: string; suppressTitle?: boolean }) {
  const renderedContent = suppressTitle ? content.replace(/^#\s+.+(?:\n+|$)/, "") : content;

  return (
    <article className="review-prose">
      <MathMarkdown
        content={renderedContent}
        rehypePlugins={[rehypeSlug, [rehypeAutolinkHeadings, { behavior: "wrap" }]]}
        components={{
          blockquote: Blockquote,
          a: (props) => <a className="font-medium text-brand underline decoration-blue-200 underline-offset-4" {...props} />,
          ul: (props) => <ul className="ml-6 list-disc space-y-1" {...props} />,
          ol: (props) => <ol className="ml-6 list-decimal space-y-1" {...props} />,
          hr: (props) => <hr className="my-8 border-slate-200" {...props} />
        }}
      />
    </article>
  );
}
