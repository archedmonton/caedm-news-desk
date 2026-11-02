/**
 * Per-click operation id sent by forms that send email. Repeating the same operation (a double click, or a retry
 * after a dropped connection) is recognised and answered with the first result instead of sending again.
 */
export function parseOpId(fd: FormData): string | undefined {
  const v = fd.get("opId");
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v.toLowerCase() : undefined;
}
