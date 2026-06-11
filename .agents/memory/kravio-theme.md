---
name: Kravio theme palette
description: PSS green removed; full neutral grey-slate palette matching Kravio enterprise style; blue chart accent; theme-aware chartBase.
---

## Decision
PSS green (#3FB950 / #16A34A) removed from all branding tokens. Replaced with Kravio-style neutral grey palette.

## Palette

**Light mode (`index.css :root`)**
- background: #F4F4F5 (zinc-100)
- card: #FFFFFF (pure white, with `--card-shadow` box-shadow)
- border: #E4E4E7
- foreground: #18181B
- muted-foreground: #71717A
- primary: #18181B (near-black — powers dark active pill + buttons)
- sidebar: #FFFFFF (white sidebar, matching Kravio)
- sidebar-primary: #18181B (dark active pill BG)
- sidebar-primary-foreground: #FFFFFF

**Dark mode (`index.css .dark`)**
- background: #111216
- card: #18191E (slightly elevated)
- border: #27272A
- foreground: #FAFAFA
- muted-foreground: #71717A
- primary: #A1A1AA (neutral grey — no bright accent)
- sidebar: #111216 (same as bg)
- sidebar-primary: #27272A (subtle active highlight)
- sidebar-primary-foreground: #FAFAFA

## Chart colours (both modes)
- chart-1 / main series: #3B82F6 (blue-500)
- chart-2: #6366F1 (indigo)
- chart-3: #F59E0B (amber)
- chart-4: #EF4444 (red)
- chart-5: #A78BFA (violet)

## Chart base: MUST be theme-aware
`home.tsx` defines `getChartBase(isDark: boolean)` at module level.
Inside the `Home` component:
```ts
const { theme } = useTheme();
const isDark = theme === "dark";
const chartBase = useMemo(() => getChartBase(isDark), [isDark]);
```
All chart option `useMemo` deps must include `isDark` or `chartBase`.

## Semantic green stays
`text-emerald-400` / `bg-emerald-400` kept for:
- Positive growth values (+X%)
- Data freshness "Up to date" indicator
- Trend icons (growing/new)
- InsightChip green variant

**Why:** green = positive / healthy is universal data-viz convention; Kravio itself uses green for positive metrics.

## How to apply
- Never add `bg-green-*`, `text-green-*`, or `#3FB950` / `#16A34A` as brand/primary colours.
- Use `bg-primary` / `text-primary` for interactive accents (they resolve to neutral dark/grey).
- Only use emerald/green for the semantic cases listed above.
