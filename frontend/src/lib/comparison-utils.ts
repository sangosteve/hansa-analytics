const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type ComparisonMode = "same_period_ly" | "previous_period";

export interface ComparisonPeriod {
  from: string;
  to: string;
  label: string;
  shortLabel: string;
}

export function getComparisonPeriod(
  dateFrom: string,
  dateTo: string,
  mode: ComparisonMode,
): ComparisonPeriod {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);

  if (mode === "same_period_ly") {
    const cFrom = new Date(from);
    cFrom.setFullYear(cFrom.getFullYear() - 1);
    const cTo = new Date(to);
    cTo.setFullYear(cTo.getFullYear() - 1);
    return { from: toISO(cFrom), to: toISO(cTo), label: "Same period last year", shortLabel: "LY" };
  }

  const msPerDay = 86_400_000;
  const periodDays = Math.round((to.getTime() - from.getTime()) / msPerDay);
  const cTo = new Date(from.getTime() - msPerDay);
  const cFrom = new Date(cTo.getTime() - periodDays * msPerDay);
  return { from: toISO(cFrom), to: toISO(cTo), label: "Previous period", shortLabel: "PP" };
}

export function getComparisonBannerText(
  dateFrom: string,
  dateTo: string,
  mode: ComparisonMode,
): string {
  const { from, to } = getComparisonPeriod(dateFrom, dateTo, mode);
  const cur = `${fmtDate(new Date(dateFrom))} – ${fmtDate(new Date(dateTo))}`;
  const cmp = `${fmtDate(new Date(from))} – ${fmtDate(new Date(to))}`;
  return `${cur}  vs  ${cmp}`;
}

function inferQuickRange(dateFrom: string, dateTo: string): "MTD" | "YTD" | "Custom" {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  to.setHours(0, 0, 0, 0);
  if (
    from.getFullYear() === today.getFullYear() &&
    from.getMonth() === today.getMonth() &&
    from.getDate() === 1 &&
    to.getTime() === today.getTime()
  ) return "MTD";
  if (
    from.getFullYear() === today.getFullYear() &&
    from.getMonth() === 0 &&
    from.getDate() === 1 &&
    to.getTime() === today.getTime()
  ) return "YTD";
  return "Custom";
}

export function buildComparisonModeLabel(
  dateFrom: string,
  dateTo: string,
  mode: ComparisonMode,
): string {
  const range = inferQuickRange(dateFrom, dateTo);
  if (mode === "same_period_ly") {
    if (range === "MTD") return "MTD vs LY MTD (Same Day)";
    if (range === "YTD") return "YTD vs LY YTD (Same Day)";
    return "Period vs LY Same Period";
  }
  if (range === "MTD") return "MTD vs Prior Month";
  if (range === "YTD") return "YTD vs Prior YTD";
  return "Period vs Prior Period";
}
