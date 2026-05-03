/** HTML-escape for receipt templates. */
export function escReceipt(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
