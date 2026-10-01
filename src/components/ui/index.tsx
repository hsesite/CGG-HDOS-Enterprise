import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'outlined';
}

export function Card({ children, className = '', variant = 'default' }: CardProps): React.ReactElement {
  const baseStyle = 'rounded-2xl transition-all duration-300';
  
  const variants = {
    default: 'bg-neutral-900/50 border border-white/10 hover:border-white/20',
    elevated: 'bg-gradient-to-br from-neutral-800/50 to-neutral-900/50 border border-white/20 shadow-lg hover:shadow-xl',
    outlined: 'border-2 border-white/20 hover:border-white/40 bg-transparent',
  };

  return (
    <div className={`${baseStyle} ${variants[variant]} ${className}`}>
      {children}
    </div>
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps): React.ReactElement {
  const baseStyle = 'font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2';
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const variants = {
    primary: 'bg-[#00E676] text-black hover:brightness-110 disabled:opacity-50',
    secondary: 'bg-white/20 text-white hover:bg-white/30 disabled:opacity-50',
    ghost: 'bg-transparent text-white hover:bg-white/10 disabled:opacity-50',
    danger: 'bg-red-600/80 text-white hover:bg-red-700 disabled:opacity-50',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyle} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading...
        </>
      ) : (
        children
      )}
    </button>
  );
}

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps): React.ReactElement {
  const variants = {
    default: 'bg-neutral-700 text-neutral-100',
    success: 'bg-green-600/30 text-green-300 border border-green-500/50',
    warning: 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/50',
    danger: 'bg-red-600/30 text-red-300 border border-red-500/50',
    info: 'bg-blue-600/30 text-blue-300 border border-blue-500/50',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps): React.ReactElement {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-xs uppercase tracking-widest text-neutral-400 font-semibold">
          {label}
        </label>
      )}
      <input
        className={`w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-2.5 text-sm text-white outline-none transition focus:border-[#00E676] focus:ring-2 focus:ring-[#00E676]/30 disabled:opacity-50 ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

export interface StatProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function Stat({ label, value, icon, trend, className = '' }: StatProps): React.ReactElement {
  return (
    <Card variant="elevated" className={`p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-neutral-400">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
        {icon && (
          <div className="rounded-lg bg-white/5 p-3 text-[#00E676]">
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <p className={`mt-2 text-xs font-semibold ${
          trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-neutral-400'
        }`}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} Trend
        </p>
      )}
    </Card>
  );
}
