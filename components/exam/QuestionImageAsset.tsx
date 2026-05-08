import { cn } from "@/lib/utils";

export function QuestionImageAsset({
  src,
  alt,
  className
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("block h-auto max-w-full object-contain", className)}
    />
  );
}
