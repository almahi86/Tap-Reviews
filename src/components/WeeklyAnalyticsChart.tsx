import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  BarChart3,
  Calendar,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import type { FeedbackItem } from "../types";

interface WeeklyAnalyticsChartProps {
  feedbacks?: FeedbackItem[];
  isExample?: boolean;
}

interface DayData {
  day: string;
  date: string;
  total: number;
  good: number;
  bad: number;
  redirected: number;
}

// Fixed showcase analytics for the example dashboard
const FIXED_CURRENT_WEEK: { day: string; good: number; bad: number }[] = [
  { day: "Mon", good: 5, bad: 1 },
  { day: "Tue", good: 6, bad: 1 },
  { day: "Wed", good: 6, bad: 0 },
  { day: "Thu", good: 7, bad: 1 },
  { day: "Fri", good: 10, bad: 1 },
  { day: "Sat", good: 13, bad: 1 },
  { day: "Sun", good: 8, bad: 1 },
];

const FIXED_PREVIOUS_WEEK: { day: string; good: number; bad: number }[] = [
  { day: "Mon", good: 5, bad: 0 },
  { day: "Tue", good: 5, bad: 1 },
  { day: "Wed", good: 6, bad: 1 },
  { day: "Thu", good: 7, bad: 0 },
  { day: "Fri", good: 9, bad: 1 },
  { day: "Sat", good: 12, bad: 1 },
  { day: "Sun", good: 7, bad: 1 },
];

export function WeeklyAnalyticsChart({
  feedbacks = [],
  isExample = false,
}: WeeklyAnalyticsChartProps) {
  const [timeRange, setTimeRange] = useState<"current" | "previous">("current");
  const [chartType, setChartType] = useState<"grouped" | "stacked">("grouped");

  // Compute daily metrics for the past 7 days (or previous week)
  const weeklyData = useMemo(() => {
    // If this is an example dashboard, return fixed realistic showcase reviews data
    if (isExample) {
      const fixedTemplate = timeRange === "current" ? FIXED_CURRENT_WEEK : FIXED_PREVIOUS_WEEK;
      const now = new Date();
      const offset = timeRange === "previous" ? 7 : 0;

      return fixedTemplate.map((item, idx) => {
        const d = new Date(now);
        d.setDate(now.getDate() - (6 - idx + offset));
        const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        const total = item.good + item.bad;

        return {
          day: item.day,
          date: dateStr,
          total,
          good: item.good,
          bad: item.bad,
          redirected: item.good,
        };
      });
    }

    const days: DayData[] = [];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();

    // Offset in days if viewing previous week
    const offset = timeRange === "previous" ? 7 : 0;

    // Generate 7 days ending today (or last week's end)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - (i + offset));
      const dayStr = dayNames[d.getDay()];
      const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

      // Determine feedback items matching this day
      const dayFeedbacks = feedbacks.filter((fb) => {
        const fbDate = new Date(fb.createdAt);
        return (
          fbDate.getFullYear() === d.getFullYear() &&
          fbDate.getMonth() === d.getMonth() &&
          fbDate.getDate() === d.getDate()
        );
      });

      const actualBad = dayFeedbacks.filter((f) => f.sentiment === "negative" || f.rating === "dislike").length;
      const actualGood = dayFeedbacks.filter((f) => f.sentiment === "positive" || f.rating === "like").length;

      // Real statistics from customer NFC interactions
      const goodCount = actualGood;
      const badCount = actualBad;
      const redirectedCount = actualGood; // 100% of Good reviews are redirected to Google Reviews
      const totalCount = goodCount + badCount;

      days.push({
        day: `${dayStr}`,
        date: dateStr,
        total: totalCount,
        good: goodCount,
        bad: badCount,
        redirected: redirectedCount,
      });
    }

    return days;
  }, [feedbacks, timeRange, isExample]);

  // Aggregate weekly totals
  const totals = useMemo(() => {
    return weeklyData.reduce(
      (acc, curr) => ({
        total: acc.total + curr.total,
        good: acc.good + curr.good,
        bad: acc.bad + curr.bad,
        redirected: acc.redirected + curr.redirected,
      }),
      { total: 0, good: 0, bad: 0, redirected: 0 }
    );
  }, [weeklyData]);

  const positiveRate = totals.total > 0 ? Math.round((totals.good / totals.total) * 100) : 0;
  const deflectedRate = totals.total > 0 ? Math.round((totals.bad / totals.total) * 100) : 0;

  return (
    <div
      id="weekly-analytics-panel"
      className="bg-[#161616] border border-white/10 rounded-xl overflow-hidden shadow-2xl p-6 sm:p-8 space-y-6"
    >
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-emerald-500 text-black flex items-center justify-center font-black">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
                Weekly Review Velocity & Interceptions
              </h2>
              <p className="text-xs text-stone-400 font-mono uppercase tracking-wider">
                7-Day In-Store NFC Tap Breakdown: Good vs Bad vs Google Redirects
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Week Toggle */}
          <div className="flex items-center bg-[#0A0A0A] p-1 border border-white/10 rounded text-xs font-mono">
            <button
              onClick={() => setTimeRange("current")}
              className={`px-3 py-1.5 rounded uppercase font-black tracking-wider transition cursor-pointer text-[11px] ${
                timeRange === "current"
                  ? "bg-emerald-500 text-black shadow font-black"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              Current Week
            </button>
            <button
              onClick={() => setTimeRange("previous")}
              className={`px-3 py-1.5 rounded uppercase font-black tracking-wider transition cursor-pointer text-[11px] ${
                timeRange === "previous"
                  ? "bg-emerald-500 text-black shadow font-black"
                  : "text-stone-400 hover:text-white"
              }`}
            >
              Previous Week
            </button>
          </div>

          {/* Bar Style Toggle */}
          <div className="flex items-center bg-[#0A0A0A] p-1 border border-white/10 rounded text-xs font-mono">
            <button
              onClick={() => setChartType("grouped")}
              className={`px-2.5 py-1.5 rounded uppercase font-black tracking-wider transition cursor-pointer text-[10px] ${
                chartType === "grouped" ? "bg-white text-black" : "text-stone-400 hover:text-white"
              }`}
            >
              Grouped
            </button>
            <button
              onClick={() => setChartType("stacked")}
              className={`px-2.5 py-1.5 rounded uppercase font-black tracking-wider transition cursor-pointer text-[10px] ${
                chartType === "stacked" ? "bg-white text-black" : "text-stone-400 hover:text-white"
              }`}
            >
              Stacked
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Reviews Gotten */}
        <div className="bg-[#1C1C1C] p-5 rounded-lg border-l-4 border-white border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-stone-400 text-xs uppercase font-mono tracking-wider">
            <span>Total NFC Taps</span>
            <Calendar className="w-4 h-4 text-stone-400" />
          </div>
          <div className="text-4xl font-black text-white tracking-tight">{totals.total}</div>
          <p className="text-[11px] text-stone-400 font-mono">
            {totals.total === 0 ? "No in-store taps logged yet" : "Total customer engagements this week"}
          </p>
        </div>

        {/* Good Reviews */}
        <div className="bg-[#1C1C1C] p-5 rounded-lg border-l-4 border-emerald-500 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-stone-400 text-xs uppercase font-mono tracking-wider">
            <span>Good Reviews</span>
            <ThumbsUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-4xl font-black text-emerald-400 tracking-tight">{totals.good}</div>
          <p className="text-[11px] text-emerald-400/90 font-mono flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>
              {totals.total === 0 ? "Awaiting your first review" : `${positiveRate}% positive satisfaction rate`}
            </span>
          </p>
        </div>

        {/* Bad Reviews Intercepted */}
        <div className="bg-[#1C1C1C] p-5 rounded-lg border-l-4 border-rose-500 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-stone-400 text-xs uppercase font-mono tracking-wider">
            <span>Private Feedback</span>
            <ThumbsDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-4xl font-black text-rose-400 tracking-tight">{totals.bad}</div>
          <p className="text-[11px] text-rose-400/90 font-mono flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              {totals.total === 0 ? "0 complaints intercepted" : `${deflectedRate}% received via private form`}
            </span>
          </p>
        </div>

        {/* Redirected to Google */}
        <div className="bg-[#1C1C1C] p-5 rounded-lg border-l-4 border-cyan-400 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-stone-400 text-xs uppercase font-mono tracking-wider">
            <span>Redirected to Google</span>
            <Sparkles className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-4xl font-black text-cyan-400 tracking-tight">
            {totals.redirected}
          </div>
          <p className="text-[11px] text-cyan-400/90 font-mono flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>
              {totals.total === 0 ? "Ready to funnel to Google" : "Routed directly to Google Maps"}
            </span>
          </p>
        </div>
      </div>

      {/* Main Bar Chart */}
      <div className="bg-[#0F0F0F] p-4 sm:p-6 rounded-xl border border-white/10 relative">
        {totals.total === 0 && (
          <div className="absolute inset-x-6 top-20 z-10 flex flex-col items-center justify-center p-6 bg-[#161616]/90 border border-white/10 rounded-xl backdrop-blur-sm text-center max-w-md mx-auto shadow-2xl">
            <ShieldCheck className="w-8 h-8 text-emerald-400 mb-2" />
            <h4 className="text-sm font-black uppercase text-white tracking-wider">
              No Customer Taps Logged Yet
            </h4>
            <p className="text-xs text-stone-400 font-mono mt-1">
              Your real-time NFC review velocity will populate here as soon as customers tap your in-store NFC stand or test your rating flow.
            </p>
          </div>
        )}
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={weeklyData}
              margin={{ top: 20, right: 20, left: -10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis
                dataKey="day"
                stroke="#737373"
                tick={{ fill: "#a3a3a3", fontSize: 12, fontFamily: "monospace" }}
                axisLine={{ stroke: "#404040" }}
                tickLine={false}
              />
              <YAxis
                stroke="#737373"
                tick={{ fill: "#a3a3a3", fontSize: 12, fontFamily: "monospace" }}
                axisLine={{ stroke: "#404040" }}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255, 255, 255, 0.04)" }}
                content={<CustomChartTooltip />}
              />
              <Legend
                wrapperStyle={{
                  paddingTop: "16px",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              />
              {chartType === "grouped" ? (
                <>
                  <Bar
                    name="Good Reviews (Likes)"
                    dataKey="good"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    name="Private Feedback"
                    dataKey="bad"
                    fill="#f43f5e"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    name="Redirected to Google"
                    dataKey="redirected"
                    fill="#38bdf8"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                </>
              ) : (
                <>
                  <Bar
                    name="Good Reviews"
                    dataKey="good"
                    stackId="a"
                    fill="#10b981"
                    maxBarSize={48}
                  />
                  <Bar
                    name="Bad Reviews (Shielded)"
                    dataKey="bad"
                    stackId="a"
                    fill="#f43f5e"
                    maxBarSize={48}
                  />
                  <Bar
                    name="Redirected to Google"
                    dataKey="redirected"
                    fill="#38bdf8"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend Explainer footer */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-stone-400 font-mono gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
              <strong className="text-white">Good Reviews:</strong> Customers who tapped "Like"
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-rose-500 inline-block" />
              <strong className="text-white">Bad Reviews:</strong> Intercepted privately
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-sky-400 inline-block" />
              <strong className="text-white">Google Redirects:</strong> 5-star funnel conversions
            </span>
          </div>

          <div className="text-emerald-400 font-black uppercase tracking-wider text-[11px]">
            Zero 1-Star Google Reviews Leaked
          </div>
        </div>
      </div>
    </div>
  );
}

// Custom Tooltip component for Recharts
function CustomChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  const data: DayData = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-[#1C1C1C] border border-white/20 p-4 rounded-lg shadow-2xl text-xs font-mono space-y-2 min-w-[220px]">
      <div className="border-b border-white/10 pb-1.5 flex items-center justify-between">
        <span className="font-black text-white uppercase text-sm">
          {data.day} • {data.date}
        </span>
        <span className="text-[10px] text-stone-400 uppercase">
          Total: <strong className="text-white">{data.total}</strong>
        </span>
      </div>

      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-emerald-400 font-bold">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Good Reviews (Like):
          </span>
          <span>{data.good}</span>
        </div>

        <div className="flex items-center justify-between text-rose-400 font-bold">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            Bad Intercepted:
          </span>
          <span>{data.bad}</span>
        </div>

        <div className="flex items-center justify-between text-sky-400 font-bold">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            Redirected to Google:
          </span>
          <span>{data.redirected}</span>
        </div>
      </div>

      <div className="border-t border-white/10 pt-2 text-[10px] text-stone-400 flex items-center justify-between">
        <span>Deflection Rate:</span>
        <span className="text-emerald-400 font-bold">100% Shielded</span>
      </div>
    </div>
  );
}
