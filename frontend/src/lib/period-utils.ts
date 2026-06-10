function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function todayISO(): string {
  return toISO(new Date());
}
function yesterdayISO(): string {
  const d = new Date(); d.setDate(d.getDate() - 1); return toISO(d);
}
function nDaysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n); return toISO(d);
}
function startOfWeekISO(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return toISO(d);
}
function endOfLastWeekISO(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -7 : -day));
  return toISO(d);
}
function startOfLastWeekISO(): string {
  const d = new Date(endOfLastWeekISO());
  d.setDate(d.getDate() - 6);
  return toISO(d);
}
function startOfMonthISO(): string {
  const d = new Date(); return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
}
function startOfLastMonthISO(): string {
  const d = new Date(); return toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}
function endOfLastMonthISO(): string {
  const d = new Date(); return toISO(new Date(d.getFullYear(), d.getMonth(), 0));
}
function startOfQuarterISO(): string {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1));
}
function endOfLastQuarterISO(): string {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 0));
}
function startOfLastQuarterISO(): string {
  const d = new Date(endOfLastQuarterISO());
  return toISO(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1));
}
function startOfYearISO(): string {
  return toISO(new Date(new Date().getFullYear(), 0, 1));
}
function startOfLastYearISO(): string {
  return toISO(new Date(new Date().getFullYear() - 1, 0, 1));
}
function endOfLastYearISO(): string {
  return toISO(new Date(new Date().getFullYear() - 1, 11, 31));
}

export function getPeriodPresets(): Record<string, { from: string; to: string }> {
  const t = todayISO();
  return {
    "Today":           { from: t,                   to: t },
    "Yesterday":       { from: yesterdayISO(),       to: yesterdayISO() },
    "This Week":       { from: startOfWeekISO(),     to: t },
    "Last Week":       { from: startOfLastWeekISO(), to: endOfLastWeekISO() },
    "This Month":      { from: startOfMonthISO(),    to: t },
    "Last Month":      { from: startOfLastMonthISO(), to: endOfLastMonthISO() },
    "This Quarter":    { from: startOfQuarterISO(),  to: t },
    "Last Quarter":    { from: startOfLastQuarterISO(), to: endOfLastQuarterISO() },
    "This Year":       { from: startOfYearISO(),     to: t },
    "Last Year":       { from: startOfLastYearISO(), to: endOfLastYearISO() },
    "Rolling 7 Days":  { from: nDaysAgo(6),          to: t },
    "Rolling 30 Days": { from: nDaysAgo(29),         to: t },
    "Rolling 90 Days": { from: nDaysAgo(89),         to: t },
    "All Time":        { from: "2020-01-01",         to: "2030-12-31" },
  };
}

export const PERIOD_GROUPS = [
  {
    group: "Preset Periods",
    items: ["Today", "Yesterday", "This Week", "Last Week", "This Month", "Last Month", "This Quarter", "Last Quarter", "This Year", "Last Year"],
  },
  {
    group: "Rolling Periods",
    items: ["Rolling 7 Days", "Rolling 30 Days", "Rolling 90 Days"],
  },
  {
    group: "Other",
    items: ["All Time", "Custom Range"],
  },
];

export function computeActivePeriod(from: string, to: string): string {
  if (!from || !to) return "Custom Range";
  const presets = getPeriodPresets();
  for (const [label, preset] of Object.entries(presets)) {
    if (preset.from === from && preset.to === to) return label;
  }
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1;
  return `Custom Range · ${days} day${days !== 1 ? "s" : ""}`;
}
