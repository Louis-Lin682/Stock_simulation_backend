export function toNumber(value: string): number | null {
  const cleaned = value
    .replaceAll(",", "")
    .replaceAll("+", "")
    .replaceAll("X", "")
    .trim();

  if (cleaned === "" || cleaned === "--") {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}
