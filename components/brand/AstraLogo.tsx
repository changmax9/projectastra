type AstraLogoProps = {
  className?: string;
  tone?: "default" | "light";
  title?: string;
};

export function AstraLogo({ className, tone = "default", title }: AstraLogoProps) {
  const background = tone === "light" ? "#ffffff" : "#3155d8";
  const letter = tone === "light" ? "#3155d8" : "#ffffff";

  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <rect x="4" y="4" width="56" height="56" rx="10" fill={background} />
      <path
        fill={letter}
        fillRule="evenodd"
        d="M31.8 13 49 49h-9.1l-3.1-7.3H26.6L23.5 49h-8.7l17-36Zm0 13.7-3.2 7.6h6.4l-3.2-7.6Z"
        clipRule="evenodd"
      />
      <path d="M22.7 34.3h18.2l3.1 7.4H19.5l3.2-7.4Z" fill="#ffd617" />
      <path d="M10 11h12v4H14v8h-4V11Z" fill="#18a8df" />
    </svg>
  );
}
