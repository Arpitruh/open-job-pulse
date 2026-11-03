"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { DollarSign, TrendingDown, TrendingUp, Zap } from "lucide-react";

interface Props {
  mrr: number;
  signupChartData: { date: string; count: number }[];
  planDistData: { name: string; count: number }[];
  creditRevenue: { total: number; transactions: number };
  churnRate: number;
  churnedThisMonth: number;
  statusBreakdown: { status: string; count: number }[];
}

const PLAN_COLORS = ["#3b82f6", "#6366f1", "#10b981"];

export default function RevenueChart({ mrr, signupChartData, planDistData, creditRevenue, churnRate, churnedThisMonth, statusBreakdown }: Props) {
  const totalActive = statusBreakdown.find((s) => s.status === "ACTIVE")?.count ?? 0;
  const totalTrialing = statusBreakdown.find((s) => s.status === "TRIALING")?.count ?? 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Revenue Analytics</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "MRR", value: `$${mrr.toFixed(0)}`, sub: `${totalActive} active plans`, icon: DollarSign, color: "text-green-600 bg-green-50" },
          { label: "Trialing", value: totalTrialing, sub: "Active trials", icon: TrendingUp, color: "text-amber-600 bg-amber-50" },
          { label: "Churn Rate", value: `${churnRate}%`, sub: `${churnedThisMonth} cancelled this month`, icon: TrendingDown, color: "text-red-600 bg-red-50" },
          { label: "Credit Revenue", value: `${creditRevenue.total} cr`, sub: `${creditRevenue.transactions} top-ups`, icon: Zap, color: "text-blue-600 bg-blue-50" },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`p-2 rounded-lg w-fit ${card.color} mb-3`}><card.icon className="w-4 h-4" /></div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm font-medium text-gray-600 mt-0.5">{card.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">New Signups — Last 30 Days</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={signupChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} interval={6} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} />
              <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">Active Plan Distribution</h2>
          {planDistData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No active subscriptions yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={planDistData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} width={60} />
                <Tooltip contentStyle={{ fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 8 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {planDistData.map((_, i) => <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}