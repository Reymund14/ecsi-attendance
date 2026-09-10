import { useState, useEffect } from "react";
import { Download, BarChart2, PieChart as PieIcon, TrendingUp } from "lucide-react";
import { format, subDays } from "date-fns";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import api from "../services/api";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const PIE_COLORS = ["#41A638", "#EF4444", "#F2C111", "#6B7280"];

export default function Reports() {
  const [overview, setOverview] = useState(null);
  const [proxyLogs, setProxyLogs] = useState([]);
  const [dateRange, setDateRange] = useState({
    date_from: format(subDays(new Date(), 7), "yyyy-MM-dd"),
    date_to: format(new Date(), "yyyy-MM-dd"),
  });

  useEffect(() => {
    api.get("/admin/analytics/overview").then(({ data }) => setOverview(data));
    fetchProxyLogs();
  }, []);

  async function fetchProxyLogs() {
    try {
      const { data } = await api.get("/admin/proxy-logs", { params: { page_size: 10 } });
      setProxyLogs(data);
    } catch { /* silent */ }
  }

  const pieData = overview
    ? [
        { name: "Verified",        value: overview.today_verified },
        { name: "Proxy Anomaly",   value: overview.today_proxy_anomaly },
        { name: "Manual Override", value: overview.today_manual_override },
      ].filter((d) => d.value > 0)
    : [];

  // Placeholder weekly bar data
  const weekData = Array.from({ length: 7 }, (_, i) => ({
    day: format(subDays(new Date(), 6 - i), "EEE"),
    verified: Math.floor(Math.random() * 120 + 80),
    proxy: Math.floor(Math.random() * 5),
  }));

  async function exportCSV() {
    const qs = new URLSearchParams(dateRange).toString();
    window.open(`${api.defaults.baseURL}/admin/export/attendance?${qs}`, "_blank");
  }

  return (
    <div className="flex min-h-screen bg-ecsiLightBg">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Reports & Analytics" connected={false} />

        <main className="p-6 space-y-6">
          {/* Export controls */}
          <div className="card flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-textGray mb-1">Date From</label>
              <input type="date" className="input w-40"
                value={dateRange.date_from}
                onChange={(e) => setDateRange({ ...dateRange, date_from: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textGray mb-1">Date To</label>
              <input type="date" className="input w-40"
                value={dateRange.date_to}
                onChange={(e) => setDateRange({ ...dateRange, date_to: e.target.value })}
              />
            </div>
            <button onClick={exportCSV} className="btn-primary flex items-center gap-2">
              <Download size={14} /> Export CSV
            </button>
          </div>

          {/* Summary cards */}
          {overview && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Today Verified",         value: overview.today_verified,            color: "text-ecsiGreen" },
                { label: "Today Proxy Anomalies",  value: overview.today_proxy_anomaly,       color: "text-alertRed" },
                { label: "Total Enrolled Users",   value: overview.total_users,               color: "text-ecsiYellow" },
                { label: "All-Time Proxy Attempts",value: overview.total_proxy_attempts_all_time, color: "text-textGray" },
              ].map(({ label, value, color }) => (
                <div key={label} className="card text-center">
                  <p className={`text-3xl font-extrabold ${color}`}>{value ?? "—"}</p>
                  <p className="text-xs text-textGray mt-1">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Weekly bar */}
            <div className="xl:col-span-2 card">
              <h2 className="text-base font-bold text-textGraphite mb-4 flex items-center gap-2">
                <BarChart2 size={16} className="text-ecsiYellow" /> Weekly Check-in Volume
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weekData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#6B7280" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="verified" name="Verified" fill="#41A638" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="proxy" name="Proxy" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie */}
            <div className="card">
              <h2 className="text-base font-bold text-textGraphite mb-4 flex items-center gap-2">
                <PieIcon size={16} className="text-ecsiGreen" /> Today's Status Breakdown
              </h2>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-textGray text-sm py-10">No data yet today.</p>
              )}
            </div>
          </div>

          {/* Proxy log table */}
          <div className="card">
            <h2 className="text-base font-bold text-textGraphite mb-4">Recent Proxy Audit Logs</h2>
            {proxyLogs.length === 0 ? (
              <p className="text-center text-textGray text-sm py-8">No proxy attempts recorded.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="pb-3 pr-4 text-xs font-semibold text-textGray uppercase tracking-wide">Registered User</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-textGray uppercase tracking-wide">Card UID</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-textGray uppercase tracking-wide">Distance</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-textGray uppercase tracking-wide">Terminal</th>
                    <th className="pb-3 text-xs font-semibold text-textGray uppercase tracking-wide">Detected</th>
                  </tr>
                </thead>
                <tbody>
                  {proxyLogs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-alertRed/5 transition-colors">
                      <td className="py-3 pr-4 font-medium text-textGraphite">{log.registered_user_name || "—"}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-textGray">{log.card_uid}</td>
                      <td className="py-3 pr-4 font-mono text-xs font-semibold text-alertRed">
                        {log.cosine_distance?.toFixed(4)}
                      </td>
                      <td className="py-3 pr-4 text-textGray text-xs">{log.terminal_id || "—"}</td>
                      <td className="py-3 text-textGray text-xs">
                        {log.detected_at ? format(new Date(log.detected_at), "MMM d HH:mm") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
