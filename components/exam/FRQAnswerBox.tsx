export function FRQAnswerBox({
  value,
  onChange,
  onBlur
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-astra-navy">Free response answer</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        rows={12}
        className="w-full resize-y rounded-2xl border border-astra-navy/20 bg-white p-4 text-sm leading-7 outline-none focus:border-astra-cyan focus:ring-2 focus:ring-cyan-100"
        placeholder="Write your reasoning clearly. Include equations, substitutions, and final explanation where useful."
      />
    </label>
  );
}
