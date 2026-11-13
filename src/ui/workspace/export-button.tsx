/** @jsxImportSource react */
/**
 * An export is a POST: a form with hidden fields and a button that looks like a link. A GET link would write the export file
 * on every visit (a crawler or a preview could trigger it), so the export is made only when the person presses the button.
 */
export function ExportButton({ label, fields }: { readonly label: string; readonly fields: readonly (readonly [string, string])[] }) {
  return (
    <form method="post" action="/workspace/export" style={{ display: "inline" }}>
      {fields.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" style={{ background: "none", border: 0, padding: 0, color: "inherit", font: "inherit", textDecoration: "underline", cursor: "pointer" }}>
        {label}
      </button>
    </form>
  );
}
