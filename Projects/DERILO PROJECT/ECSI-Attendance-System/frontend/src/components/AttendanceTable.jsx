import { format } from "date-fns";
import { CheckCircle2, AlertTriangle, Clock, UserCheck } from "lucide-react";

const BADGE = {
  verified:        { cls: "badge-verified",  Icon: CheckCircle2,  label: "Verified" },
  proxy_anomaly:   { cls: "badge-proxy",     Icon: AlertTriangle, label: "Proxy" },
  pending_review:  { cls: "badge-pending",   Icon: Clock,         label: "Pending" },
  manual_override: { cls: "badge-override",  Icon: UserCheck,     label: "Override" },
};

export default function AttendanceTable({ records, onOverride, showUser = true }) {
  if (!records?.length) {
    return (
      <div className="text-center py-16 text-textGray text-sm">
        <Clock size={32} className="mx-auto mb-3 text-gray-200" />
        No attendance records found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            {showUser && <th className="pb-3 pr-4 font-semibold text-textGray text-xs uppercase tracking-wide">Student</th>}
            <th className="pb-3 pr-4 font-semibold text-textGray text-xs uppercase tracking-wide">Status</th>
            <th className="pb-3 pr-4 font-semibold text-textGray text-xs uppercase tracking-wide">Type</th>
            <th className="pb-3 pr-4 font-semibold text-textGray text-xs uppercase tracking-wide">Distance</th>
            <th className="pb-3 pr-4 font-semibold text-textGray text-xs uppercase tracking-wide">Terminal</th>
            <th className="pb-3 pr-4 font-semibold text-textGray text-xs uppercase tracking-wide">Timestamp</th>
            {onOverride && <th className="pb-3 font-semibold text-textGray text-xs uppercase tracking-wide">Action</th>}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const badge = BADGE[r.status] || BADGE.pending_review;
            const Icon = badge.Icon;
            return (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-ecsiLightBg transition-colors">
                {showUser && (
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-ecsiYellow/20 flex items-center justify-center text-xs font-bold text-textGraphite">
                        {r.full_name?.[0] || "?"}
                      </div>
                      <div>
                        <p className="font-medium text-textGraphite text-sm">{r.full_name || "—"}</p>
                        <p className="text-xs text-textGray">{r.id_number}</p>
                      </div>
                    </div>
                  </td>
                )}
                <td className="py-3 pr-4">
                  <span className={badge.cls}>
                    <Icon size={10} />
                    {badge.label}
                  </span>
                </td>
                <td className="py-3 pr-4 text-textGray capitalize">{r.check_type?.replace("_", " ")}</td>
                <td className="py-3 pr-4">
                  {r.cosine_distance != null ? (
                    <span className={`font-mono text-xs font-semibold ${
                      r.cosine_distance <= 0.40 ? "text-ecsiGreen" : "text-alertRed"
                    }`}>
                      {r.cosine_distance.toFixed(4)}
                    </span>
                  ) : <span className="text-textGray">—</span>}
                </td>
                <td className="py-3 pr-4 text-textGray text-xs">{r.terminal_id || "—"}</td>
                <td className="py-3 pr-4 text-textGray text-xs whitespace-nowrap">
                  {r.timestamp ? format(new Date(r.timestamp), "MMM d, yyyy HH:mm:ss") : "—"}
                </td>
                {onOverride && (
                  <td className="py-3">
                    <button
                      onClick={() => onOverride(r)}
                      className="text-xs font-medium text-ecsiYellow hover:text-yellow-600 transition-colors"
                    >
                      Override
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
