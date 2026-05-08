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
      <span className="mb-2 block text-sm font-medium text-slate-700">Free response answer</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        rows={12}
        className="w-full resize-y rounded-lg border border-slate-300 bg-white p-4 text-sm leading-7 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100"
        placeholder="Write your reasoning clearly. Include equations, substitutions, and final explanation where useful."
      />
    </label>
  );
}
