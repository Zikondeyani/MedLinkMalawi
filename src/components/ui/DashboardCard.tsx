import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

export default function DashboardCard({
  icon,
  label,
  value,
  sub,
  trend,
  tone = "navy",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  trend?: number;
  tone?: "navy" | "teal" | "green" | "amber";
}) {
  const moneyMatch = /^MWK\s+(.+)$/.exec(value);

  return (
    <div className="card dash-card">
      <div className={`dash-card-icon dash-card-${tone}`}>{icon}</div>
      <div className="dash-card-label">{label}</div>
      <div className={`dash-card-value${moneyMatch ? " dash-card-money-value" : ""}`}>
        {moneyMatch ? (
          <>
            <span className="dash-card-currency">MWK</span>
            <span>{moneyMatch[1]}</span>
          </>
        ) : value}
      </div>
      <div className="dash-card-sub">
        {trend != null && (
          <span className={`dash-trend ${trend >= 0 ? "up" : "down"}`}>
            {trend >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {Math.abs(trend)}%
          </span>
        )}
        {sub && <span className="muted small">{sub}</span>}
      </div>
    </div>
  );
}