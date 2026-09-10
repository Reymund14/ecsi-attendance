import { useState, useCallback, useEffect } from "react";
import {
  CheckCircle2, AlertTriangle, Users, Activity,
  ShieldAlert, Clock,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import StatsCard from "../components/StatsCard";
import RealtimeFeed from "../components/RealtimeFeed";
import AlertBanner from "../components/AlertBanner";
import api from "../services/api";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

const MAX_FEED = 50;

export default function AdminDashboard() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [proxyAlerts, setProxyAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);

  // ── Fetch today's stats ──────────────────────────────────────────────────
  useEffect(() => {
    api.get("/admin/analytics/overview").then(({ data }) => setStats(data));
    // Build hourly placeholder chart data
    const hours = Array.from({ length: 12 }, (_, i) => ({
      time: `${(7 + i).toString().padStart(2, "0")}:00`,
      verified: Math.floor(Math.random() * 40),
      proxy: Math.floor(Math.random() * 3),
    }));
    setChartData(hours);
  }, []);

  // ── WebSocket event handler ──────────────────────────────────────────────
  const handleEvent = useCallback((event) => {
    if (event.event === "attendance_update" || event.event === "attendance_override") {
      setEvents((prev) => [event, ...prev].slice(0, MAX_FEED));
      if (event.status === "proxy_anomaly") {
        setProxyAlerts((prev) => [...prev, event]);
      }
      // Bump stats
      setStats((prev) =>
        prev
          ? {
              ...prev,
              today_verified: event.status === "verified" ? (prev.today_verified || 0) + 1 : prev.today_verified,
              today_proxy_anomaly: event.status === "proxy_anomaly" ? (prev.today_proxy_anomaly || 0) + 1 : prev.today_proxy_anomaly,
              today_total: (prev.today_total || 0) + 1,
            }
          : prev
      );
    }
    if (event.event === "proxy_alert") {
      setProxyAlerts((prev) => [...prev, event]);
    }
  }, []);

  const { connected } = useWebSocket(user?.token, handleEvent);

  function dismissAlert(alert) {
    setProxyAlerts((prev) => prev.filter((a) => a !== alert));
  }

  return (
    <div className="flex min-h-screen bg-ecsiLightBg">
      <Sidebar />

      <div className="flex-1 ml-60">
        <Header
          title="Live Dashboard"
          connected={connected}
          alertCount={proxyAlerts.length}
        />

        {/* Proxy alert banner */}
        <AlertBanner alerts={proxyAlerts} onDismiss={dismissAlert} />

        <main className="p-6 space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              label="Verified Today"
              value={stats?.today_verified ?? "—"}
              icon={CheckCircle2}
              color="ecsiGreen"
            />
            <StatsCard
              label="Proxy Attempts"
              value={stats?.today_proxy_anomaly ?? "—"}
              icon={ShieldAlert}
              color="alertRed"
            />
            <StatsCard
              label="Total Check-ins"
              value={stats?.today_total ?? "—"}
              icon={Activity}
              color="ecsiYellow"
            />
            <StatsCard
              label="Enrolled Users"
              value={stats?.total_users ?? "—"}
              icon={Users}
              color="blue"
            />
          </div>

          {/* Chart + Feed */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Area chart */}
            <div className="xl:col-span-2 card">
              <h2 className="text-base font-bold text-textGraphite mb-4">Hourly Check-in Activity</h2>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gVerified" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#41A638" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#41A638" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gProxy" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#6B7280" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="verified"
                    stroke="#41A638"
                    strokeWidth={2}
                    fill="url(#gVerified)"
                    name="Verified"
                  />
                  <Area
                    type="monotone"
                    dataKey="proxy"
                    stroke="#EF4444"
                    strokeWidth={2}
                    fill="url(#gProxy)"
                    name="Proxy"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Live feed */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-textGraphite">Live Feed</h2>
                <span className={`flex items-center gap-1.5 text-xs font-medium ${
                  connected ? "text-ecsiGreen" : "text-alertRed"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-ecsiGreen animate-pulse" : "bg-alertRed"}`} />
                  {connected ? "Live" : "Reconnecting…"}
                </span>
              </div>
              <RealtimeFeed events={events} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
