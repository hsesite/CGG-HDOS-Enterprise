import React from 'react';

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
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick();
        }
      }}
      className={`apple-glass-card rounded-2xl border p-4 transition-all duration-300 ${statusColors[status]} ${
        onClick ? 'cursor-pointer hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#00E676]/50' : ''
      } ${className}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-widest text-neutral-400">{title}</h3>
        {icon ? <div className={`rounded-lg p-2 ${iconBgColors[status]}`}>{icon}</div> : null}
      </div>

      <div className="mb-2">
        <p className="font-mono text-3xl font-bold tabular-nums text-white">{value}</p>
      </div>

      <div className="flex min-h-5 items-center justify-between gap-2">
        {subtitle ? <p className="text-xs text-neutral-400">{subtitle}</p> : <span />}
        {trend ? (
          <div className={`flex items-center gap-1 text-xs font-semibold ${trend.isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </div>
        ) : null}
      </div>
    </div>
  );
}
