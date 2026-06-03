import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, RotateCcw, Loader2, ChevronDown, AlertTriangle, Info } from "lucide-react";
import ReactECharts from "echarts-for-react";

import {
  askAIInsight,
  getAISuggestions,
  type AIInsightResponse,
  type AISuggestion,
} from "@/lib/api";

const FALLBACK_SUGGESTIONS: AISuggestion[] = [
  { text: "Show sales trend for the last 12 months by division", icon: "📈" },
  { text: "Which product groups declined the most this quarter?", icon: "📉" },
  { text: "Compare internal vs external sales", icon: "🔄" },
  { text: "Which customers stopped buying?", icon: "🚨" },
  { text: "Project this month's sales", icon: "🔮" },
  { text: "Which products should sales focus on?", icon: "🎯" },
  { text: "Show top 10 customers in Retail", icon: "🏆" },
  { text: "Why did sales drop this month?", icon: "🔍" },
];

type ConversationTurn = {
  id: string;
  question: string;
  response: AIInsightResponse;
};

type AIInsightsPanelProps = {
  companyNos?: string[];
  saleScope?: string;
  dateFrom?: string;
  dateTo?: string;
};

function ToolBadge({ tools }: { tools: string[] }) {
  if (!tools.length) return null;
  const display = tools.length === 1
    ? tools[0].replace(/_/g, " ")
    : `${tools.length} analyses`;
  return (
    <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground/70 mt-1">
      <Sparkles className="h-2.5 w-2.5" />
      {display}
    </span>
  );
}

function ScopeBadge({ scope }: { scope?: string | null }) {
  if (!scope) return null;
  return (
    <div className="flex items-start gap-1 mt-1.5">
      <Info className="h-3 w-3 text-primary/60 flex-shrink-0 mt-0.5" />
      <span className="text-[10px] text-primary/70 leading-tight">{scope}</span>
    </div>
  );
}

function WarningBadge({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 mt-2">
      <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />
      <div className="space-y-0.5">
        {warnings.map((w, i) => (
          <p key={i} className="text-[10px] text-amber-600 dark:text-amber-400 leading-tight">{w}</p>
        ))}
      </div>
    </div>
  );
}

function ResponseCard({
  turn,
  onFollowUp,
  loading,
}: {
  turn: ConversationTurn;
  onFollowUp: (q: string) => void;
  loading: boolean;
}) {
  const r = turn.response;
  const [tableExpanded, setTableExpanded] = useState(false);
  const displayRows = tableExpanded
    ? (r.table?.rows ?? [])
    : (r.table?.rows ?? []).slice(0, 8);

  return (
    <div className="space-y-2.5">
      {/* User bubble */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-primary px-3 py-2">
          <p className="text-xs text-primary-foreground leading-snug">{turn.question}</p>
        </div>
      </div>

      {/* AI response */}
      <div className="space-y-2">
        {/* Answer card */}
        <div className="rounded-md border border-border bg-secondary/60 p-3">
          <p className="text-xs text-foreground leading-relaxed">{r.answer}</p>
          <ScopeBadge scope={r.company_scope} />
          {r.assumptions && r.assumptions.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
              <span className="font-medium">Assumptions: </span>
              {r.assumptions.join(" • ")}
            </p>
          )}
          <ToolBadge tools={r.tools_used ?? []} />
        </div>

        {/* Warnings */}
        <WarningBadge warnings={r.warnings ?? []} />

        {/* Chart */}
        {r.chart && r.chart.type !== "none" && r.chart.option && (
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {r.chart.title}
            </p>
            <ReactECharts
              option={{
                backgroundColor: "transparent",
                textStyle: { color: "#8b949e", fontSize: 10 },
                ...r.chart.option,
              }}
              style={{ width: "100%", height: "230px" }}
              notMerge={true}
              lazyUpdate={true}
            />
          </div>
        )}

        {/* Table */}
        {r.table && r.table.rows.length > 0 && (
          <div className="rounded-md border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary">
                    {r.table.columns.map((col) => (
                      <th
                        key={col}
                        className="text-left px-2.5 py-1.5 font-semibold text-muted-foreground whitespace-nowrap text-[10px]"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-border/50 last:border-0 hover:bg-secondary/50 transition-colors"
                    >
                      {r.table!.columns.map((col) => {
                        const val = row[col];
                        const strVal = val == null ? "" : String(val);
                        // Colour negative numbers red, positive green for change columns
                        const isChangeCol = col.toLowerCase().includes("change") ||
                          col.toLowerCase().includes("growth") ||
                          col.toLowerCase().includes("gap") ||
                          col.toLowerCase().includes("%");
                        const numVal = typeof val === "number" ? val : parseFloat(strVal);
                        const colourClass = isChangeCol && !isNaN(numVal)
                          ? numVal < 0 ? "text-red-500" : numVal > 0 ? "text-emerald-500" : ""
                          : "";
                        return (
                          <td
                            key={`${idx}-${col}`}
                            className={`px-2.5 py-1.5 whitespace-nowrap ${colourClass || "text-foreground"}`}
                          >
                            {strVal}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(r.table?.rows.length ?? 0) > 8 && (
              <button
                onClick={() => setTableExpanded((x) => !x)}
                className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-muted-foreground hover:text-foreground border-t border-border bg-secondary/40 hover:bg-secondary transition-colors"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${tableExpanded ? "rotate-180" : ""}`} />
                {tableExpanded ? "Show less" : `Show all ${r.table?.rows.length} rows`}
              </button>
            )}
          </div>
        )}

        {/* Follow-up chips */}
        {r.follow_up_questions && r.follow_up_questions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {r.follow_up_questions.map((q, i) => (
              <button
                key={i}
                onClick={() => onFollowUp(q)}
                disabled={loading}
                className="px-2.5 py-1 rounded-full text-[10px] border border-primary/30
                  bg-primary/5 text-primary hover:bg-primary/15 hover:border-primary/60
                  transition-colors disabled:opacity-40 disabled:cursor-not-allowed leading-tight"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AIInsightsPanel({
  companyNos,
  saleScope,
  dateFrom,
  dateTo,
}: AIInsightsPanelProps = {}) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>(FALLBACK_SUGGESTIONS);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAISuggestions()
      .then(setSuggestions)
      .catch(() => setSuggestions(FALLBACK_SUGGESTIONS));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, loading]);

  const ask = async (text: string) => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setMessage("");

    // Build history from current conversation
    const history = conversation.flatMap((t) => [
      { role: "user" as const, content: t.question },
      { role: "assistant" as const, content: t.response.answer },
    ]);

    try {
      const result = await askAIInsight(text, {
        company_nos: companyNos,
        sale_scope: saleScope,
        date_from: dateFrom,
        date_to: dateTo,
        history: history.slice(-8),
      });

      setConversation((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          question: text,
          response: result,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get AI insight");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ask(message);
  };

  const handleReset = () => {
    setConversation([]);
    setError(null);
    setMessage("");
    inputRef.current?.focus();
  };

  const hasConversation = conversation.length > 0;

  // Active context pill
  const contextLabel = (() => {
    const parts: string[] = [];
    if (companyNos && !companyNos.includes("all") && companyNos.length < 4) {
      const names: Record<string, string> = { "3": "Retail", "4": "Mfg", "5": "Eng", "6": "Mining" };
      parts.push(companyNos.map((c) => names[c] ?? c).join(", "));
    } else {
      parts.push("All companies");
    }
    if (saleScope && saleScope !== "all") {
      parts.push(saleScope === "external" ? "External only" : "Internal only");
    }
    return parts.join(" · ");
  })();

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 flex-shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground leading-tight">AI Insights</p>
            <p className="text-[10px] text-muted-foreground leading-tight truncate">{contextLabel}</p>
          </div>
        </div>
        {hasConversation && (
          <button
            onClick={handleReset}
            title="New conversation"
            className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-md
              text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Conversation area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">

        {/* Initial suggestions */}
        {!hasConversation && !loading && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Try asking
            </p>
            <div className="space-y-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => ask(s.text)}
                  disabled={loading}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-xs
                    bg-secondary border border-border text-foreground
                    hover:bg-accent hover:border-primary/40 transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {s.icon && <span className="text-sm leading-none flex-shrink-0">{s.icon}</span>}
                  <span className="leading-snug">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversation turns */}
        {conversation.map((turn, idx) => (
          <ResponseCard
            key={turn.id}
            turn={turn}
            onFollowUp={ask}
            loading={loading}
          />
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="space-y-2">
            {/* Ghost user bubble for in-progress question */}
            {message === "" && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-primary/70 px-3 py-2">
                  <Loader2 className="h-3 w-3 animate-spin text-primary-foreground" />
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/60 border border-border w-fit">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <p className="text-[11px] text-muted-foreground">Analysing data…</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex-shrink-0 border-t border-border p-3 flex gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          placeholder={hasConversation ? "Ask a follow-up…" : "Ask about sales, customers, trends…"}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={loading}
          className="flex-1 min-w-0 bg-secondary border border-border rounded-md px-3 py-2
            text-xs text-foreground placeholder:text-muted-foreground
            focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
            disabled:opacity-40 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-md
            bg-primary text-primary-foreground
            hover:bg-primary/80 disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      </form>
    </div>
  );
}
