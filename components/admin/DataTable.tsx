import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    <div className="admin-surface overflow-hidden rounded-[1.5rem]">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-[rgba(6,18,37,0.92)] text-xs uppercase tracking-wide text-white">
            <TableRow>
              {headers.map((header) => (
                <TableHead key={header} className="px-4 py-3 font-black text-white">
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell className="px-4 py-8 text-center text-slate-500" colSpan={headers.length}>
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, rowIndex) => (
                <TableRow key={rowIndex} className="align-top transition hover:bg-sky-50/70">
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex} className="px-4 py-3">
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
