import { CURRENCY, LOCALE } from "./constants";
// All money is integer centavos (PHP). Never floats.
const fmt = new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY });
export const peso = (centavos: number) => fmt.format(centavos / 100);

/** Fixed schedule: monthly amortization x term. Remaining = what is still owed per the schedule. */
export function loanSummary(monthly: number, term: number, paidCount: number) {
  const total = monthly * term;
  const paid = monthly * paidCount;
  return { total, paid, remaining: total - paid, pct: Math.round((paidCount / term) * 100) };
}

export function addMonths(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
