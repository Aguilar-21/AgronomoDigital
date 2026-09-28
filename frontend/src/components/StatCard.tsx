import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  trend?: string;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor,
  trend,
}: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${iconColor}15`, color: iconColor }}
        >
          <Icon size={22} />
        </div>

        {trend && (
          <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-[#1B5E20]">
            {trend}
          </span>
        )}
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-500">
          {title}
        </p>

        <h3 className="mt-1 text-2xl font-bold text-slate-800">
          {value}
        </h3>

        <p className="mt-1 text-xs text-slate-400">
          {description}
        </p>
      </div>
    </div>
  );
}

export default StatCard;