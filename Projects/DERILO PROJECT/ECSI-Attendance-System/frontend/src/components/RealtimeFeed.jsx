import { CheckCircle2, AlertTriangle, Clock, UserCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_CONFIG = {
  verified: {
    icon: CheckCircle2,
    iconClass: "text-ecsiGreen",
    badge: "badge-verified",
    label: "Verified",
    bg: "bg-ecsiGreen/5 border-ecsiGreen/20",
  },
  proxy_anomaly: {
    icon: AlertTriangle,
    iconClass: "text-alertRed animate-pulse-fast",
    badge: "badge-proxy",
    label: "Proxy Detected",
    bg: "bg-alertRed/5 border-alertRed/20",
  },
  pending_review: {
    icon: Clock,
    iconClass: "text-yellow-500",
    badge: "badge-pending",
    label: "Pending Review",
    bg: "bg-yellow-50 border-yellow-200",
  },
  manual_override: {
    icon: UserCheck,
    iconClass: "text-blue-500",
    badge: "badge-override",
    label: "Override",
    bg: "bg-blue-50 border-blue-200",
  },
};

function FeedItem({ event }) {
  const cfg = STATUS_CONFIG[event.status] || STATUS_CONFIG.pending_review;
  const Icon = cfg.icon;
  const timeAgo = formatDistanceToNow(new Date(event.timestamp), { addSuffix: true });

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl border animate-slide-in ${cfg.bg}`}
    >
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
        {event.profile_photo_path ? (
          <img
            src={`http://localhost:8000${event.profile_photo_path}`}
            alt={event.full_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-ecsiYellow/20">
            <span className="text-textGraphite font-bold text-sm">
              {event.full_name?.[0] || "?"}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-textGraphite text-sm truncate">{event.full_name}</p>
          <span className={cfg.badge}>
            <Icon size={10} className={cfg.iconClass} />
            {cfg.label}
          </span>
        </div>
        <p className="text-textGray text-xs">{event.id_number} · {event.terminal_id || "Unknown Terminal"}</p>
        {event.cosine_distance != null && (
          <p className="text-xs text-textGray">
            Distance:{" "}
            <span className={event.status === "verified" ? "text-ecsiGreen font-medium" : "text-alertRed font-medium"}>
              {event.cosine_distance.toFixed(4)}
            </span>
          </p>
        )}
        <p className="text-[11px] text-textGray/70 mt-0.5">{timeAgo}</p>
      </div>
    </div>
  );
}

export default function RealtimeFeed({ events }) {
  return (
    <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto pr-1">
      {events.length === 0 ? (
        <div className="text-center py-12 text-textGray text-sm">
          <Clock size={32} className="mx-auto mb-3 text-gray-300" />
          <p>Waiting for attendance events…</p>
        </div>
      ) : (
        events.map((evt, i) => <FeedItem key={evt.record_id || i} event={evt} />)
      )}
    </div>
  );
}
