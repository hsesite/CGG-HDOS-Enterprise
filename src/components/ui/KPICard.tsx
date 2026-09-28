import React from 'lucide-react';

export interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  status?: 'normal' | 'warning' | 'critical' | 'success';
  onClick?: () => void;
  className?: string;
}

export function KPICard({
  title,
  value,
  subtitle,
  icon,
  trend,
  status = 'normal',
  onClick,
  className = '',
}: KPICardProps): JSX.Element {
  const statusColors = {
    normal: 'border-white/10 hover:border-white/20',
    warning: 'border-yellow-500/30 hover:border-yellow-500/50 bg-yellow-500/5',
    critical: 'border-red-500/30 hover:border-red-500/50 bg-red-500/5',
    success: 'border-green-500/30 hover:border-green-500/50 bg-green-500/5',
  };

  const iconBgColors = {
    normal: 'bg-white/10 text-neutral-400',
    warning: 'bg-yellow-500/20 text-yellow-400',
    critical: 'bg-red-500/20 text-red-400',
    success: 'bg-green-500/20 text-green-400',
  };

  return (
    <div
      onClick={onClick}
      className={`apple-glass-card p-4 rounded-2xl border transition-all duration-300 ${
        statusColors[status]
      } ${onClick ? 'cursor-pointer hover:shadow-lg' : ''} ${className}`}
    >
      {/* Header: Title + Icon */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium uppercase tracking-widest text-neutral-400">
          {title}
        </h3>
        {icon && (
          <div className={`p-2 rounded-lg ${iconBgColors[status]}`}>
            {icon}
          </div>
        )}
      </div>

      {/* Main Value */}
      <div className="mb-2">
        <p className="text-3xl font-bold text-white font-mono tabular-nums">
          {value}
        </p>
      </div>

      {/* Footer: Subtitle + Trend */}
      <div className="flex items-center justify-between">
        {subtitle && (
          <p className="text-xs text-neutral-400">{subtitle}</p>
        )}
        {trend && (
          <div className={`text-xs font-semibold flex items-center gap-1 ${
            trend.isPositive ? 'text-green-400' : 'text-red-400'
          }`}>
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </div>
        )}
      </div>
    </div>
  );
}
