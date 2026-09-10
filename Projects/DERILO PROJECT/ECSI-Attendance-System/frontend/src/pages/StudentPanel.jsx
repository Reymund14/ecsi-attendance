import { useState, useEffect } from "react";
import { format } from "date-fns";
import { BookOpen, CheckCircle2, Clock, AlertTriangle, Camera } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import AttendanceTable from "../components/AttendanceTable";
import api from "../services/api";

export default function StudentPanel() {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ verified: 0, proxy: 0, pending: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    date_from: "",
    date_to: "",
  });

  async function fetchRecords() {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const { data } = await api.get("/attendance", { params });
      setRecords(data);

      // Build summary
      const sv = { verified: 0, proxy: 0, pending: 0, total: data.length };
      data.forEach((r) => {
        if (r.status === "verified" || r.status === "manual_override") sv.verified++;
        else if (r.status === "proxy_anomaly") sv.proxy++;
        else sv.pending++;
      });
      setSummary(sv);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRecords(); }, []);

  return (
    <div className="flex min-h-screen bg-ecsiLightBg">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="My Attendance" connected={false} />

        <main className="p-6 space-y-6">
          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Records",   value: summary.total,    Icon: BookOpen,      color: "bg-ecsiYellow/10 text-ecsiYellow" },
              { label: "Verified",         value: summary.verified, Icon: CheckCircle2,  color: "bg-ecsiGreen/10 text-ecsiGreen" },
              { label: "Proxy Detected",  value: summary.proxy,    Icon: AlertTriangle, color: "bg-alertRed/10 text-alertRed" },
              { label: "Pending Review",  value: summary.pending,  Icon: Clock,         color: "bg-yellow-50 text-yellow-600" },
            ].map(({ label, value, Icon, color }) => (
              <div key={label} className="card flex items-center gap-4">
                <div className={`p-3 rounded-xl ${color}`}>
                  <Icon size={20} />
                </div>
                <div>
                  <p className="text-2xl font-extrabold text-textGraphite">{value}</p>
                  <p className="text-xs text-textGray">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filter row */}
          <div className="card flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-textGray mb-1">From</label>
              <input type="date" className="input w-40"
                value={filters.date_from}
                onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textGray mb-1">To</label>
              <input type="date" className="input w-40"
                value={filters.date_to}
                onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
              />
            </div>
            <button onClick={fetchRecords} className="btn-primary">Filter</button>
          </div>

          {/* Records table (no user column, no override) */}
          <div className="card">
            <h2 className="text-base font-bold text-textGraphite mb-4">Attendance History</h2>
            {loading ? (
              <p className="text-center text-textGray text-sm py-10">Loading…</p>
            ) : (
              <AttendanceTable records={records} showUser={false} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
