export function maskDocument(value: string, type?: string): string {
  const normalized = value.replace(/\W/g, "");
  if (type === "CPF" && normalized.length === 11) return `***.***.***-${normalized.slice(-2)}`;
  return `${"*".repeat(Math.max(0, normalized.length - 2))}${normalized.slice(-2)}`;
}
