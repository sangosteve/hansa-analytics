import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, RotateCcw, Loader2 } from "lucide-react";
import ReactECharts from "echarts-for-react";

import {
  askAIInsight,
  getAISuggestions,
  type AIInsightResponse,
  type AISuggestion,
} from "@/lib/api";

const suggestions_fallback: AISuggestion[] = [
  { text: "Show sales trend for the last 6 months", icon: "📈" },
  { text: "Which product groups are declining?", icon: "📉" },
  { text: "Show top 10 customers by tonnage", icon: "🏆" },
  { text: "Compare current month vs previous month", icon: "📊" },
  { text: "Which customers stopped buying?", icon: "🚨" },
  { text: "Show salesperson performance this month", icon: "👤" },
];

export default function AIInsightsPanel() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIInsightResponse | null>(null);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>(suggestions_fallback);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAISuggestions()
      .then(setSuggestions)
      .catch(() => setSuggestions(suggestions_fallback));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [response, loading]);

  const ask = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setMessage("");
    try {
      const result = await askAIInsight(text);
      setResponse(result);
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
    setResponse(null);
    setError(null);
    setMessage("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight">AI Insights</p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Ask about tonnage, customers, trends
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {/* Suggestions — shown when no response */}
        {!response && !loading && (
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
                  {s.icon && <span className="text-sm leading-none">{s.icon}</span>}
                  <span className="leading-snug">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Analysing data…</p>
          </div>
        )}

        {/* Response */}
        {response && !loading && (
          <div className="space-y-3">
            {/* Answer */}
            <div className="rounded-md border border-border bg-secondary p-3">
              <p className="text-xs text-foreground leading-relaxed">{response.answer}</p>
              {response.assumptions.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                  <span className="font-medium">Assumptions: </span>
                  {response.assumptions.join(", ")}
                </p>
              )}
            </div>

            {/* Chart */}
            {response.chart && response.chart.type !== "none" && (
              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {response.chart.title}
                </p>
                <ReactECharts
                  option={{
                    backgroundColor: "transparent",
                    textStyle: { color: "#8b949e" },
                    ...response.chart.option,
                  }}
                  style={{ width: "100%", height: "220px" }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              </div>
            )}

            {/* Table */}
            {response.table && response.table.rows.length > 0 && (
              <div className="rounded-md border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-secondary">
                        {response.table.columns.map((col) => (
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
                      {response.table.rows.slice(0, 12).map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-border/50 last:border-0 hover:bg-secondary/50 transition-colors"
                        >
                          {response.table!.columns.map((col) => (
                            <td
                              key={`${idx}-${col}`}
                              className="px-3 py-1.5 text-foreground whitespace-nowrap"
                            >
                              {String(row[col] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Follow-up questions */}
            {response.follow_up_questions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Follow-up
                </p>
                <div className="space-y-1.5">
                  {response.follow_up_questions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => ask(q)}
                      disabled={loading}
                      className="w-full text-left px-3 py-2 rounded-md text-xs
                        bg-secondary border border-border text-foreground
                        hover:bg-accent hover:border-primary/40 transition-colors
                        disabled:opacity-40"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reset */}
            <button
              onClick={handleReset}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md text-xs
                text-muted-foreground border border-border bg-secondary
                hover:text-foreground hover:border-border/80 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              New question
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
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
          placeholder="Ask about sales, customers, trends…"
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
