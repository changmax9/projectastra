import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import type { PluggableList } from "unified";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMathDelimiters } from "@/lib/math-markdown";
import { cn } from "@/lib/utils";

export function MathMarkdown({
  content,
  className,
  components,
  rehypePlugins = []
}: {
  content: string;
  className?: string;
  components?: Components;
  rehypePlugins?: PluggableList;
}) {
  return (
    <div className={cn("math-markdown", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[...rehypePlugins, rehypeKatex]}
        components={components}
      >
        {normalizeMathDelimiters(content)}
      </ReactMarkdown>
    </div>
  );
}

export type MathMarkdownComponentProps = ComponentProps<typeof MathMarkdown>;
