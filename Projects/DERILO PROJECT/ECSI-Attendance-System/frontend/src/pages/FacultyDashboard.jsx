import { useState, useCallback, useEffect } from "react";
import { CheckCircle2, AlertTriangle, Clock, Search, Download } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import AttendanceTable from "../components/AttendanceTable";
import AlertBanner from "../components/AlertBanner";
import api from "../services/api";

export default function FacultyDashboard() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [proxyAlerts, setProxyAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [overrideModal, setOverrideModal] = useState(null);
  const [overrideForm, setOverrideForm] = useState({ status: "verified", note: "" });
  const [filters, setFilters] = useState({
    date_from: format(new Date(), "yyyy-MM-dd"),
    date_to: format(new Date(), "yyyy-MM-dd"),
    status: "",
  });

  async function fetchRecords() {
    setLoading(true);
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v)
      );
      const { data } = await api.get("/attendance", { params });
      setRecords(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRecords(); }, []);

  const handleEvent = useCallback((event) => {
    if (event.event === "attendance_update") {
      setRecords((prev) => [event, ...prev]);
      if (event.status === "proxy_anomaly") setProxyAlerts((p) => [...p, event]);
    }
  }, []);

  const { connected } = useWebSocket(user?.token, handleEvent);

  async function submitOverride() {
    try {
      await api.patch(`/attendance/${overrideModal.id}/override`, overrideForm);
      setOverrideModal(null);
      fetchRecords();
    } catch (e) {
      alert(e.response?.data?.detail || "Override failed.");
    }
  }

  async function exportCSV() {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const qs = new URLSearchParams(params).toString();
    window.open(`${api.defaults.baseURL}/admin/export/attendance?${qs}`, "_blank");
  }

  return (
    <div className="flex min-h-screen bg-ecsiLightBg">
      <Sidebar />
      <div className="flex-1 ml-60">
        <Header title="Attendance Records" connected={connected} alertCount={proxyAlerts.length} />
        <AlertBanner alerts={proxyAlerts} onDismiss={(a) => setProxyAlerts((p) => p.filter((x) => x !== a))} />

        <main className="p-6 space-y-5">
          {/* Filters */}
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
            <div>
              <label className="block text-xs font-semibold text-textGray mb-1">Status</label>
              <select className="input w-44"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">All Statuses</option>
                <option value="verified">Verified</option>
                <option value="proxy_anomaly">Proxy Anomaly</option>
                <option value="pending_review">Pending Review</option>
                <option value="manual_override">Manual Override</option>
              </select>
            </div>
            <button onClick={fetchRecords} className="btn-primary flex items-center gap-2">
              <Search size={14} /> Search
            </button>
            <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 ml-auto">
              <Download size={14} /> Export CSV
            </button>
          </div>

          {/* Table */}
          <div className="card">
            <h2 className="text-base font-bold text-textGraphite mb-4">
              Records <span className="text-sm font-normal text-textGray">({records.length})</span>
            </h2>
            {loading ? (
              <div className="text-center py-12 text-textGray text-sm">Loading…</div>
            ) : (
              <AttendanceTable records={records} onOverride={(r) => setOverrideModal(r)} />
            )}
          </div>
        </main>
      </div>

      {/* Override Modal */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-textGraphite mb-4">Manual Override</h3>
            <p className="text-sm text-textGray mb-4">
              Student: <span className="font-semibold">{overrideModal.full_name}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-textGray mb-1">New Status</label>
                <select className="input"
                  value={overrideForm.status}
                  onChange={(e) => setOverrideForm({ ...overrideForm, status: e.target.value })}
                >
                  <option value="verified">Verified</option>
                  <option value="manual_override">Manual Override</option>
                  <option value="pending_review">Pending Review</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-textGray mb-1">Reason / Note</label>
                <textarea className="input resize-none" rows={3}
                  placeholder="Explain the reason for this override…"
                  value={overrideForm.note}
                  onChange={(e) => setOverrideForm({ ...overrideForm, note: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={submitOverride} className="btn-primary flex-1">Confirm Override</button>
              <button onClick={() => setOverrideModal(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
