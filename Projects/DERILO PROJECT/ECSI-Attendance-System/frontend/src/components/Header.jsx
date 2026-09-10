import { Wifi, WifiOff, Bell } from "lucide-react";
import { format } from "date-fns";

export default function Header({ title, connected, alertCount = 0 }) {
  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-20 shadow-sm">
      <h1 className="text-lg font-bold text-textGraphite">{title}</h1>

      <div className="flex items-center gap-4">
        {/* Live date/time */}
        <span className="text-sm text-textGray hidden sm:block">
          {format(new Date(), "EEE, MMM d yyyy · h:mm a")}
        </span>

        {/* WS status */}
        <div
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
            connected
              ? "text-ecsiGreen border-ecsiGreen/30 bg-ecsiGreen/5"
              : "text-alertRed border-alertRed/30 bg-alertRed/5"
          }`}
        >
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {connected ? "Live" : "Offline"}
        </div>

        {/* Alert bell */}
        {alertCount > 0 && (
          <div className="relative">
            <Bell size={18} className="text-textGray" />
            <span className="absolute -top-1 -right-1.5 w-4 h-4 rounded-full bg-alertRed text-white text-[9px] font-bold flex items-center justify-center">
              {alertCount > 9 ? "9+" : alertCount}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
