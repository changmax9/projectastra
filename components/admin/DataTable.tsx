import type { ReactNode } from "react";

export function DataTable({
  headers,
  rows,
  empty
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-white/60 bg-white/85 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.35)] backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50/90 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={headers.length}>
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="align-top transition hover:bg-slate-50/80">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
