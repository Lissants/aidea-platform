/** Simple key-by-key before/after diff, readable without a JSON viewer. */
export function AuditDiff({ prior, next }: { prior: unknown; next: unknown }) {
  const priorObj = (prior && typeof prior === 'object' ? prior : {}) as Record<string, unknown>;
  const nextObj = (next && typeof next === 'object' ? next : {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(priorObj), ...Object.keys(nextObj)]));

  if (keys.length === 0) {
    return <p className="text-xs text-muted-foreground">No field-level detail recorded.</p>;
  }

  const fmt = (v: unknown) => (v === undefined ? '—' : v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v));

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground">
          <th className="py-1 text-left font-medium">Field</th>
          <th className="py-1 text-left font-medium">Before</th>
          <th className="py-1 text-left font-medium">After</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => {
          const changed = fmt(priorObj[k]) !== fmt(nextObj[k]);
          return (
            <tr key={k} className="border-t">
              <td className="py-1 pr-2 font-medium text-foreground">{k}</td>
              <td className={changed ? 'py-1 pr-2 text-destructive' : 'py-1 pr-2 text-muted-foreground'}>{fmt(priorObj[k])}</td>
              <td className={changed ? 'py-1 text-success' : 'py-1 text-muted-foreground'}>{fmt(nextObj[k])}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
