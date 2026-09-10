import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function StatsCard({ label, value, sub, trend, icon: Icon, color = "ecsiYellow" }) {
  const colorMap = {
    ecsiYellow: "bg-ecsiYellow/10 text-ecsiYellow",
    ecsiGreen:  "bg-ecsiGreen/10 text-ecsiGreen",
    alertRed:   "bg-alertRed/10 text-alertRed",
    blue:       "bg-blue-50 text-blue-500",
  };

  return (
    <div className="card hover:shadow-card-hover transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-textGray uppercase tracking-wide mb-1">{label}</p>
          <p className="text-3xl font-extrabold text-textGraphite">{value ?? "—"}</p>
          {sub && <p className="text-xs text-textGray mt-1">{sub}</p>}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-xl ${colorMap[color] || colorMap.ecsiYellow}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
      {trend != null && (
        <div className={`flex items-center gap-1 mt-3 text-xs font-medium ${
          trend > 0 ? "text-ecsiGreen" : trend < 0 ? "text-alertRed" : "text-textGray"
        }`}>
          {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
          {trend > 0 ? `+${trend}` : trend} vs. yesterday
        </div>
      )}
    </div>
  );
}
