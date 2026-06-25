import type { ReactNode } from "react";

export function SpecTable({
  headers,
  rows,
  colWidths,
}: {
  headers: ReactNode[];
  rows: ReactNode[][];
  colWidths?: (string | undefined)[];
}) {
  return (
    <div className="help2-table-wrap">
      <table className="help2-table">
        {colWidths && (
          <colgroup>
            {colWidths.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}
          </colgroup>
        )}
        <thead>
          <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
