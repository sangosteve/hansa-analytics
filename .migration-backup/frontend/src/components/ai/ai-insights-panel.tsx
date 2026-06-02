import { useEffect, useRef, useState } from "react";
import { Send, Zap } from "lucide-react";
import ReactECharts from "echarts-for-react";

import {
  askAIInsight,
  getAISuggestions,
  type AIInsightResponse,
  type AISuggestion,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function AIInsightsPanel() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIInsightResponse | null>(null);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSuggestions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [response]);

  const loadSuggestions = async () => {
    try {
      const data = await getAISuggestions();
      setSuggestions(data);
    } catch (err) {
      console.error("Failed to load suggestions:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await askAIInsight(message);
      setResponse(result);
      setMessage("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to get AI insight"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = async (text: string) => {
    setMessage("");
    setLoading(true);
    setError(null);

    try {
      const result = await askAIInsight(text);
      setResponse(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to get AI insight"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="min-h-[600px] flex flex-col">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <div>
            <CardTitle>AI Sales Insights</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              Ask questions about sales tonnage, product groups, customers, and
              buying patterns
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4 p-6 overflow-y-auto">
        {!response && suggestions.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-3">
              TRY ASKING:
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion.text)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-full transition"
                >
                  {suggestion.icon && <span className="mr-1">{suggestion.icon}</span>}
                  {suggestion.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {response && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg border">
              <p className="text-sm text-slate-900">{response.answer}</p>
              {response.assumptions.length > 0 && (
                <p className="text-xs text-slate-500 mt-2">
                  Assumptions: {response.assumptions.join(", ")}
                </p>
              )}
            </div>

            {response.chart && response.chart.type !== "none" && (
              <div className="bg-white p-4 rounded-lg border">
                <p className="text-xs font-semibold text-slate-600 mb-2">
                  {response.chart.title}
                </p>
                <ReactECharts
                  option={response.chart.option}
                  style={{ width: "100%", height: "300px" }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              </div>
            )}

            {response.table && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b">
                      {response.table.columns.map((col) => (
                        <th
                          key={col}
                          className="text-left px-3 py-2 font-semibold text-slate-700"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {response.table.rows.map((row, idx) => (
                      <tr key={idx} className="border-b hover:bg-slate-50">
                        {response.table!.columns.map((col) => (
                          <td
                            key={`${idx}-${col}`}
                            className="px-3 py-2 text-slate-600"
                          >
                            {String(row[col] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {response.follow_up_questions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">
                  FOLLOW-UP:
                </p>
                <div className="space-y-2">
                  {response.follow_up_questions.map((question, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSuggestionClick(question)}
                      disabled={loading}
                      className="w-full text-left text-xs px-3 py-2 bg-slate-50 hover:bg-blue-50 disabled:opacity-50 rounded border border-slate-200 hover:border-blue-300 transition"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setResponse(null);
                setSuggestions([]);
                loadSuggestions();
              }}
              className="w-full px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded transition"
            >
              New Query
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 p-3 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </CardContent>

      <form
        onSubmit={handleSubmit}
        className="border-t p-4 flex gap-2 bg-slate-50"
      >
        <Input
          type="text"
          placeholder="Ask me about sales, customers, or trends..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={loading}
          className="flex-1"
        />
        <Button
          type="submit"
          disabled={loading || !message.trim()}
          className="px-4"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}
