import { slugify } from "@/lib/utils";

export interface TocItem {
  id: string;
  text: string;
  depth: number;
}

export function extractToc(markdown: string): TocItem[] {
  return markdown
    .split("\n")
    .map((line) => {
      const match = /^(#{2,3})\s+(.+)$/.exec(line.trim());
      if (!match) return null;
      const text = match[2].replace(/[`*_]/g, "");
      return {
        id: slugify(text),
        text,
        depth: match[1].length
      };
    })
    .filter(Boolean) as TocItem[];
}

export function TableOfContents({ items }: { items: TocItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <p className="mb-3 font-semibold text-ink">Table of Contents</p>
      <div className="space-y-2">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`block text-slate-600 hover:text-brand ${item.depth === 3 ? "pl-4" : ""}`}
          >
            {item.text}
          </a>
        ))}
      </div>
    </nav>
  );
}
