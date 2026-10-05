/** the data behind a chart, for screen readers or for anyone who wants the numbers */
export function ReportTable({
  caption,
  head,
  rows,
  foot,
  srOnly = false,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
  foot?: (string | number)[];
  srOnly?: boolean;
}) {
  return (
    <div className={srOnly ? 'sr-only' : 'table-scroll'}>
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((label, i) => (
              <th key={label} scope="col" className={i > 0 ? 'num' : undefined}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[0])}>
              {row.map((cell, i) => (
                <td key={head[i]} className={i > 0 ? 'num' : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr>
              {foot.map((cell, i) => (
                <th
                  key={head[i]}
                  scope={i === 0 ? 'row' : undefined}
                  className={i > 0 ? 'num' : undefined}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
