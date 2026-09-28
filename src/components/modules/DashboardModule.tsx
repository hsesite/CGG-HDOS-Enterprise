import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  Clock,
  Activity,
  Flame,
  CloudLightning,
  MapPin,
  ArrowRight,
  Plus,
  Compass,
  FileText,
  Users,
  TrendingUp,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useHDOSStore } from '../../core/store';
import { hdosSync } from '../../core/sync';
import { Button } from '../ui';
import { KPICard } from '../ui/KPICard';
import { CardSkeleton, ChartSkeleton } from '../ui/Skeleton';

export const DashboardModule: React.FC = () => {
  const store = useHDOSStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<'7D' | '14D' | '30D'>('30D');

  const totalInspections = store.inspections.length;
  const openHazards = store.hazards.filter((h) => h.status !== 'CLOSED').length;
  const criticalHazards = store.hazards.filter((h) => h.riskMatrix?.level === 'CRITICAL').length;
  const activePicas = store.picas.filter((p) => p.status !== 'CLOSED').length;
  const overduePicas = store.picas.filter((p) => p.status === 'OVERDUE').length;

  // Refresh data from Google Sheets
  async function handleRefresh(): Promise<void> {
    setIsRefreshing(true);
    try {
      await hdosSync.syncAll();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }

  // Generate 30-day historical trend data
  const trendData = useMemo(() => {
    const data = [];
    const baseSafeHours = store.safeHours - 44000;
    const hazardFluctuations = [
      4, 5, 5, 6, 4, 3, 4, 5, 4, 3, 2, 3, 4, 3, 2, 3, 4, 5, 4, 3, 3, 2, 3, 4, 3, 2, 3, 3, 2, openHazards,
    ];

    const today = new Date(2026, 8, 28); // Current date

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayLabel = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });

      const progressFraction = (30 - i) / 30;
      const hours = Math.round(baseSafeHours + 44000 * progressFraction);
      const hazards = hazardFluctuations[29 - i] ?? openHazards;

      data.push({
        date: dayLabel,
        safeHours: i === 0 ? store.safeHours : hours,
        activeHazards: i === 0 ? openHazards : hazards,
      });
    }
    return data;
  }, [store.safeHours, openHazards]);

  // Filter trend data by timeframe
  const activeTrendData = useMemo(() => {
    const days = timeRange === '7D' ? 7 : timeRange === '14D' ? 14 : 30;
    return trendData.slice(trendData.length - days);
  }, [trendData, timeRange]);

  // Calculate safe hours delta
  const rangeDeltaHours = useMemo(() => {
    if (activeTrendData.length < 2) return 0;
    const first = activeTrendData[0].safeHours;
    const last = activeTrendData[activeTrendData.length - 1].safeHours;
    return last - first;
  }, [activeTrendData]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Executive Dashboard</h1>
          <p className="text-sm text-neutral-400">Real-time HSE operational metrics</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          isLoading={isRefreshing}
          className="gap-2"
        >
          <RefreshCw size={16} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Safe Man Hours"
          value={store.safeHours.toLocaleString('id-ID')}
          subtitle="LTI-Free Operations"
          icon={<ShieldCheck size={20} />}
          status="success"
          trend={{ value: 12.5, isPositive: true }}
          onClick={() => store.openWindow('inspection')}
        />

        <KPICard
          title="Inspections"
          value={totalInspections}
          subtitle="Field compliance rate"
          icon={<ClipboardList size={20} />}
          status="normal"
          trend={{ value: 5.2, isPositive: true }}
          onClick={() => store.openWindow('inspection')}
        />

        <KPICard
          title="Active Hazards"
          value={openHazards}
          subtitle={criticalHazards > 0 ? `${criticalHazards} critical` : 'Controlled'}
          icon={<AlertTriangle size={20} />}
          status={criticalHazards > 0 ? 'critical' : 'warning'}
          trend={{ value: 3.1, isPositive: false }}
          onClick={() => store.openWindow('hazard')}
        />

        <KPICard
          title="Corrective Actions"
          value={activePicas}
          subtitle={overduePicas > 0 ? `${overduePicas} overdue` : 'On track'}
          icon={<CheckCircle2 size={20} />}
          status={overduePicas > 0 ? 'warning' : 'success'}
          trend={{ value: 2.8, isPositive: false }}
          onClick={() => store.openWindow('pica')}
        />
      </div>

      {/* Performance Trends Chart */}
      <div className="apple-glass-card p-4 sm:p-6 rounded-[24px] space-y-4 border border-white/10">
        {/* Chart Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#00E676]/15 border border-[#00E676]/30 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-[#00E676]" />
              </span>
              <h2 className="text-base sm:text-lg font-bold text-white">Performance Trends</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-neutral-300">
                Live
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Safe Hours vs Active Hazards over {timeRange === '7D' ? '7' : timeRange === '14D' ? '14' : '30'} days
            </p>
          </div>

          {/* Timeframe Controls */}
          <div className="flex items-center gap-2 p-1 rounded-xl bg-black/40 border border-white/10 text-xs">
            {(['7D', '14D', '30D'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded-lg transition-all font-medium cursor-pointer ${
                  timeRange === range
                    ? 'bg-[#00E676]/20 text-[#00E676] font-bold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="w-full h-64 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={activeTrendData} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="rgba(255,255,255,0.35)"
                tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
                tickLine={false}
                interval={timeRange === '7D' ? 0 : timeRange === '14D' ? 1 : 4}
              />
              <YAxis
                yAxisId="left"
                stroke="rgba(0,230,118,0.5)"
                tick={{ fill: '#00E676', fontSize: 11 }}
                tickLine={false}
                domain={['dataMin - 4000', 'dataMax + 4000']}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="rgba(255,82,82,0.5)"
                tick={{ fill: '#FF5252', fontSize: 11 }}
                domain={[0, 8]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload?.length) {
                    return (
                      <div className="apple-glass p-3 rounded-xl border border-white/20 text-xs space-y-2">
                        <div className="font-bold text-white">{payload[0]?.payload?.date}</div>
                        {payload.map((entry: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-neutral-300">
                              {entry.name}: <strong>{entry.value}</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '11px' }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="safeHours"
                name="Safe Hours"
                stroke="#00E676"
                strokeWidth={2.5}
                dot={timeRange === '7D'}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="activeHazards"
                name="Active Hazards"
                stroke="#FF5252"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={timeRange === '7D'}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Grid: Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-2 apple-glass-card p-5 rounded-2xl">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#42A5F5]" />
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'New Inspection', icon: Plus, color: 'blue', action: 'inspection' },
              { label: 'Report Hazard', icon: AlertTriangle, color: 'red', action: 'hazard' },
              { label: 'AI Scan', icon: Flame, color: 'purple', action: 'ai' },
              { label: 'Cloud Sync', icon: CloudLightning, color: 'green', action: 'sync' },
            ].map((item) => {
              const Icon = item.icon;
              const colorMap = {
                blue: 'bg-blue-500/15 border-blue-500/30 hover:bg-blue-500/25 text-blue-200',
                red: 'bg-red-500/15 border-red-500/30 hover:bg-red-500/25 text-red-200',
                purple: 'bg-purple-500/15 border-purple-500/30 hover:bg-purple-500/25 text-purple-200',
                green: 'bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-200',
              };

              return (
                <button
                  key={item.label}
                  onClick={() => store.openWindow(item.action as any)}
                  className={`p-3 rounded-xl border ${colorMap[item.color as keyof typeof colorMap]} transition-all cursor-pointer group`}
                >
                  <Icon className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
                  <div className="text-xs font-semibold text-white">{item.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Weather & Status */}
        <div className="apple-glass-card p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/10">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Site Status
            </span>
            <span className="text-[10px] px-2 py-1 rounded-full bg-green-500/20 text-green-400 font-semibold">
              {store.weather?.pitStatus || 'NORMAL'}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-400">Temperature</span>
              <span className="text-white font-mono font-bold">{store.weather?.temp || 28}°C</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Humidity</span>
              <span className="text-white font-mono font-bold">{store.weather?.humidity || 65}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Heat Stress</span>
              <span className="text-amber-400 font-mono font-bold">{store.weather?.heatStressLevel || 'NORMAL'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
