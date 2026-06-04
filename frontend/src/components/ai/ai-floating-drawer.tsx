import { useState, useCallback } from "react";
import {
  SparklesIcon,
  Cancel01Icon,
  Maximize01Icon,
  Minimize01Icon,
  Pin02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
} from "hugeicons-react";
import ReactECharts from "echarts-for-react";

import AIInsightsPanel, { type LargeViewPayload, type PinnedTurn } from "./ai-insights-panel";
import type { AITableResult } from "@/lib/api";

// ─── Company / date helpers ───────────────────────────────────────────────────

const COMPANY_NAMES: Record<string, string> = {
  "3": "Retail",
  "4": "Manufacturing",
  "5": "Engineering",
  "6": "Mining",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function buildContextLine(
  companyNos?: string[],
  saleScope?: string,
  dateFrom?: string,
  dateTo?: string,
): string {
  const parts: string[] = [];

  if (!companyNos || companyNos.includes("all") || companyNos.length >= 4) {
    parts.push("All companies");
  } else {
    parts.push(companyNos.map((n) => COMPANY_NAMES[n] ?? n).join(" + "));
  }

  if (saleScope === "external") parts.push("External sales");
  else if (saleScope === "internal") parts.push("Internal sales");

  if (dateFrom && dateTo) parts.push(`${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`);

  return parts.join("  ·  ");
}

// ─── Full-table viewer ────────────────────────────────────────────────────────

function FullTableView({ table }: { table: AITableResult }) {
  return (
    <div className="overflow-auto max-h-[60vh] rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border">
            {table.columns.map((col) => (
              <th
                key={col}
                className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, idx) => (
            <tr key={idx} className="border-b border-border/50 last:border-0 hover:bg-secondary/50">
              {table.columns.map((col) => {
                const val = row[col];
                const str = val == null ? "" : String(val);
                const num = parseFloat(str);
                const isChange =
                  col.toLowerCase().includes("change") ||
                  col.toLowerCase().includes("growth") ||
                  col.toLowerCase().includes("gap") ||
                  col.toLowerCase().includes("%");
                const colour =
                  isChange && !isNaN(num)
                    ? num < 0
                      ? "text-red-500"
                      : num > 0
                        ? "text-emerald-500"
                        : ""
                    : "";
                return (
                  <td key={col} className={`px-3 py-1.5 whitespace-nowrap ${colour || "text-foreground"}`}>
                    {str}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Large View Modal ─────────────────────────────────────────────────────────

function LargeViewModal({
  payload,
  onClose,
}: {
  payload: LargeViewPayload;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-[92vw] max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{payload.title}</h3>
            {payload.answer && (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-3xl">
                {payload.answer}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <Cancel01Icon size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {payload.chart && payload.chart.type !== "none" && (
            <div className="rounded-lg border border-border bg-background p-4">
              <ReactECharts
                option={{
                  backgroundColor: "transparent",
                  textStyle: { color: "#8b949e", fontSize: 11 },
                  ...payload.chart.option,
                }}
                style={{ width: "100%", height: "440px" }}
                notMerge
                lazyUpdate
              />
            </div>
          )}
          {payload.table && payload.table.rows.length > 0 && (
            <FullTableView table={payload.table} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pinned insight card ──────────────────────────────────────────────────────

function PinnedCard({
  item,
  onUnpin,
  onViewLarger,
}: {
  item: PinnedTurn;
  onUnpin: () => void;
  onViewLarger: (p: LargeViewPayload) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex-1 text-left flex items-center gap-2 min-w-0"
        >
          <Pin02Icon size={12} className="text-primary flex-shrink-0" />
          <span className="text-[11px] font-medium text-foreground truncate">{item.question}</span>
          {collapsed ? (
            <ArrowDown01Icon size={12} className="text-muted-foreground flex-shrink-0" />
          ) : (
            <ArrowUp01Icon size={12} className="text-muted-foreground flex-shrink-0" />
          )}
        </button>
        <button
          onClick={onUnpin}
          className="ml-2 flex-shrink-0 h-5 w-5 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          title="Unpin"
        >
          <Pin02Icon size={12} />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-2 border-t border-primary/10">
          <p className="text-[11px] text-foreground leading-relaxed pt-2">
            {item.response.answer}
          </p>
          {(item.response.chart || item.response.table) && (
            <button
              onClick={() =>
                onViewLarger({
                  title: item.question,
                  answer: item.response.answer,
                  chart: item.response.chart,
                  table: item.response.table,
                })
              }
              className="text-[10px] text-primary hover:underline flex items-center gap-1"
            >
              <Maximize01Icon size={12} />
              View chart / table
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main floating drawer ─────────────────────────────────────────────────────

type Props = {
  companyNos?: string[];
  saleScope?: string;
  dateFrom?: string;
  dateTo?: string;
};

export default function AIFloatingDrawer({ companyNos, saleScope, dateFrom, dateTo }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [largeView, setLargeView] = useState<LargeViewPayload | null>(null);
  const [pinned, setPinned] = useState<PinnedTurn[]>([]);
  const [showPinned, setShowPinned] = useState(false);

  const contextLine = buildContextLine(companyNos, saleScope, dateFrom, dateTo);

  const handlePin = useCallback((turn: PinnedTurn) => {
    setPinned((prev) => {
      if (prev.some((p) => p.id === turn.id)) return prev;
      return [turn, ...prev];
    });
    setShowPinned(true);
  }, []);

  const handleUnpin = useCallback((id: string) => {
    setPinned((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const drawerWidth = isExpanded ? "w-[82vw]" : "w-[680px] max-w-[100vw]";

  return (
    <>
      {/* ── Floating trigger button ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 pl-4 pr-5 py-3 rounded-full
            bg-primary text-primary-foreground shadow-xl hover:bg-primary/90 active:scale-95
            transition-all duration-150 text-[13px] font-semibold select-none"
          aria-label="Open AI Insights"
        >
          <SparklesIcon size={16} />
          AI Insights
          {pinned.length > 0 && (
            <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[9px] font-bold">
              {pinned.length}
            </span>
          )}
        </button>
      )}

      {/* ── Mobile backdrop ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ── Drawer panel ── */}
      <div
        className={`fixed top-0 right-0 h-full z-50 flex flex-col
          bg-card border-l border-border shadow-2xl
          ${drawerWidth}
          transform transition-all duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Drawer header */}
        <div className="flex-shrink-0 border-b border-border bg-card/95 backdrop-blur-sm">
          <div className="flex items-start justify-between px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 flex-shrink-0">
                  <SparklesIcon size={14} className="text-primary" />
                </div>
                <span className="text-sm font-semibold text-foreground">AI Sales Insights</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 ml-8 leading-tight truncate">
                {contextLine}
              </p>
            </div>

            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
              {/* Pinned indicator */}
              {pinned.length > 0 && (
                <button
                  onClick={() => setShowPinned((s) => !s)}
                  title={showPinned ? "Hide pinned" : "Show pinned"}
                  className={`flex items-center gap-1 h-7 px-2 rounded-md text-[10px] font-medium transition-colors
                    ${showPinned ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                >
                  <Pin02Icon size={12} />
                  {pinned.length}
                </button>
              )}

              {/* Expand/collapse */}
              <button
                onClick={() => setIsExpanded((e) => !e)}
                title={isExpanded ? "Collapse" : "Expand"}
                className="h-7 w-7 flex items-center justify-center rounded-md
                  text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                {isExpanded ? (
                  <Minimize01Icon size={14} />
                ) : (
                  <Maximize01Icon size={14} />
                )}
              </button>

              {/* Close */}
              <button
                onClick={() => setIsOpen(false)}
                title="Close"
                className="h-7 w-7 flex items-center justify-center rounded-md
                  text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Cancel01Icon size={14} />
              </button>
            </div>
          </div>

          {/* Pinned items strip */}
          {showPinned && pinned.length > 0 && (
            <div className="border-t border-border px-4 py-3 space-y-2 max-h-[260px] overflow-y-auto bg-card/50">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Pinned insights
              </p>
              {pinned.map((item) => (
                <PinnedCard
                  key={item.id}
                  item={item}
                  onUnpin={() => handleUnpin(item.id)}
                  onViewLarger={setLargeView}
                />
              ))}
            </div>
          )}
        </div>

        {/* AI panel — takes remaining height */}
        <div className="flex-1 min-h-0">
          <AIInsightsPanel
            companyNos={companyNos}
            saleScope={saleScope}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onViewLarger={setLargeView}
            onPin={handlePin}
          />
        </div>
      </div>

      {/* ── Large view modal ── */}
      {largeView && (
        <LargeViewModal payload={largeView} onClose={() => setLargeView(null)} />
      )}
    </>
  );
}
