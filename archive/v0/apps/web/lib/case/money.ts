/**
 * Money helpers (plan invariant: all money is integer cents, never floats).
 * Rendering and input parsing are pure integer math — safe for client and
 * server components alike.
 */

/** Render integer cents as a dollar string, e.g. 123456 -> "$1,234.56". */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const rem = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${rem}`;
}

/** Integer cents -> plain dollars string for an <input>, e.g. 123456 -> "1234.56". */
export function centsToDollarInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Parse a user-typed dollars string into integer cents.
 * Empty input means "no amount" (null). Invalid input -> ok: false.
 */
export function parseDollarsToCents(
  input: string,
): { ok: true; cents: number | null } | { ok: false } {
  const trimmed = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (trimmed === "") return { ok: true, cents: null };
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(trimmed)) return { ok: false };
  const [dollars, fraction = ""] = trimmed.split(".");
  const cents = Number(dollars) * 100 + Number((fraction + "00").slice(0, 2));
  return { ok: true, cents };
}
