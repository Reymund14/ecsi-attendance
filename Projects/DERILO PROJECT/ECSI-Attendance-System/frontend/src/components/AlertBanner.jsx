import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

export default function AlertBanner({ alerts, onDismiss }) {
  if (!alerts || alerts.length === 0) return null;

  const latest = alerts[alerts.length - 1];

  return (
    <div className="fixed top-4 right-4 z-50 w-80 animate-slide-in">
      <div className="bg-alertRed text-white rounded-xl shadow-xl p-4 border-2 border-alertRed/30">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-full bg-white/20 animate-pulse-fast">
              <AlertTriangle size={14} />
            </div>
            <span className="font-bold text-sm uppercase tracking-wide">
              Proxy Attempt Detected
            </span>
          </div>
          <button
            onClick={() => onDismiss(latest)}
            className="text-white/70 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Details */}
        <div className="text-sm text-white/90 space-y-1">
          <p>
            Card used by: <span className="font-semibold">{latest.registered_user_name}</span>
          </p>
          <p>
            Cosine distance:{" "}
            <span className="font-mono font-bold">
              {latest.cosine_distance?.toFixed(4)}
            </span>
          </p>
          {latest.terminal_id && (
            <p>Terminal: <span className="font-medium">{latest.terminal_id}</span></p>
          )}
        </div>

        {/* Intruder image */}
        {latest.intruder_image_path && (
          <div className="mt-3 rounded-lg overflow-hidden border-2 border-white/30">
            <img
              src={`http://localhost:8000/static/audit/${latest.intruder_image_path.split("/").pop()}`}
              alt="Intruder capture"
              className="w-full object-cover max-h-32"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          </div>
        )}

        {/* Badge count */}
        {alerts.length > 1 && (
          <p className="text-xs text-white/60 mt-2">
            +{alerts.length - 1} more alert{alerts.length > 2 ? "s" : ""} pending
          </p>
        )}
      </div>
    </div>
  );
}
