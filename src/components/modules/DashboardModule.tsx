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

export const DashboardModule: React.FC = () => {
  const store = useHDOSStore();

  const totalInspections = store.inspections.length;
  const openHazards = store.hazards.filter((h) => h.status !== 'CLOSED').length;
  const criticalHazards = store.hazards.filter((h) => h.riskMatrix.level === 'CRITICAL').length;
  const activePicas = store.picas.filter((p) => p.status !== 'CLOSED').length;
  const overduePicas = store.picas.filter((p) => p.status === 'OVERDUE').length;

  const [timeRange, setTimeRange] = useState<'7D' | '14D' | '30D'>('30D');

  // Generate 30-day historical trend data for Safe Hours and Active Hazards
  const trendData = useMemo(() => {
    const data = [];
    const baseSafeHours = store.safeHours - 44000;
    const hazardFluctuations = [
      4, 5, 5, 6, 4, 3, 4, 5, 4, 3, 2, 3, 4, 3, 2, 3, 4, 5, 4, 3, 3, 2, 3, 4, 3, 2, 3, 3, 2, openHazards,
    ];

    const today = new Date(2026, 8, 24); // 24 Sept 2026

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayLabel = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });

      // Daily hours progression (~1,450 to 1,550 hours added per day across fleets)
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

  // Filter trend data according to selected timeframe
  const activeTrendData = useMemo(() => {
    const days = timeRange === '7D' ? 7 : timeRange === '14D' ? 14 : 30;
    return trendData.slice(trendData.length - days);
  }, [trendData, timeRange]);

  // Dynamic range safe hours delta
  const rangeDeltaHours = useMemo(() => {
    if (activeTrendData.length < 2) return 0;
    const first = activeTrendData[0].safeHours;
    const last = activeTrendData[activeTrendData.length - 1].safeHours;
    return last - first;
  }, [activeTrendData]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Executive KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Safe Man Hours */}
        <div className="apple-glass-card p-4 rounded-2xl relative overflow-hidden group">
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-2">
            <span className="font-medium">Jam Kerja Selamat (LTI-Free)</span>
            <ShieldCheck className="w-4 h-4 text-[#00E676]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-mono tabular-nums">
            {store.safeHours.toLocaleString('id-ID')}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-[#00E676]">
            <span className="w-2 h-2 rounded-full bg-[#00E676] animate-ping" />
            <span>0 Fatality · 0 LTI (YTD 2026)</span>
          </div>
        </div>

        {/* KPI 2: Active Inspections */}
        <div className="apple-glass-card p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-2">
            <span className="font-medium">Inspeksi Lapangan Selesai</span>
            <ClipboardList className="w-4 h-4 text-[#42A5F5]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-mono tabular-nums">
            {totalInspections}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-neutral-400">
            <span>Tingkat Kepatuhan: <strong className="text-white font-mono">96.4%</strong></span>
            <button
              onClick={() => store.openWindow('inspection')}
              className="text-[#42A5F5] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              Detail <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* KPI 3: Open Hazards */}
        <div className="apple-glass-card p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-2">
            <span className="font-medium">Hazard Aktif (Belum Tutup)</span>
            <AlertTriangle className="w-4 h-4 text-[#FF5252]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-mono tabular-nums flex items-baseline gap-2">
            <span>{openHazards}</span>
            {criticalHazards > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                {criticalHazards} Kritis
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-neutral-400">
            <span>Unsafe Condition / Action</span>
            <button
              onClick={() => store.openWindow('hazard')}
              className="text-[#FF5252] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              Tinjau <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* KPI 4: Active PICA */}
        <div className="apple-glass-card p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-2">
            <span className="font-medium">Tindakan Koreksi (PICA)</span>
            <CheckCircle2 className="w-4 h-4 text-[#FFC107]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-mono tabular-nums flex items-baseline gap-2">
            <span>{activePicas}</span>
            <span className="text-xs text-neutral-400 font-normal">berjalan</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-neutral-400">
            <span>Overdue: <strong className={overduePicas > 0 ? 'text-red-400' : 'text-emerald-400'}>{overduePicas}</strong></span>
            <button
              onClick={() => store.openWindow('pica')}
              className="text-[#FFC107] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              Lacak <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Performance Trends Card (Recharts + Custom macOS Glass Tooltips) */}
      <div className="apple-glass-card p-4 sm:p-6 rounded-[24px] space-y-4 border border-white/10 shadow-2xl relative overflow-hidden">
        {/* Header with Title, Period Telemetry & Segmented Controls */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#00E676]/15 border border-[#00E676]/30 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-[#00E676]" />
              </span>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
                Performance Trends
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-neutral-300">
                Live Telemetry
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Comparing Safe Hours and Active Hazards over the last {timeRange === '7D' ? '7' : timeRange === '14D' ? '14' : '30'} days to visualize operational trends.
            </p>
          </div>

          {/* Timeframe Segmented Control & Live Badges */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-end">
            {/* Range Toggle Buttons */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setTimeRange('7D')}
                className={`px-2.5 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                  timeRange === '7D'
                    ? 'bg-white/20 text-white font-bold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                7 Hari
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('14D')}
                className={`px-2.5 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                  timeRange === '14D'
                    ? 'bg-white/20 text-white font-bold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                14 Hari
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('30D')}
                className={`px-2.5 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                  timeRange === '30D'
                    ? 'bg-white/20 text-white font-bold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                30 Hari
              </button>
            </div>

            {/* Metric Pills */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                <span className="w-2 h-2 rounded-full bg-[#00E676] shadow-[0_0_6px_#00E676]" />
                <span className="text-neutral-300 hidden sm:inline">Delta:</span>
                <strong className="text-[#00E676] tabular-nums">+{rangeDeltaHours.toLocaleString('id-ID')} Jam</strong>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-500/10 border border-red-500/25">
                <span className="w-2 h-2 rounded-full bg-[#FF5252] shadow-[0_0_6px_#FF5252]" />
                <span className="text-neutral-300 hidden sm:inline">Hazards:</span>
                <strong className="text-red-400 tabular-nums">{openHazards} Open</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Recharts Responsive Canvas */}
        <div className="w-full h-64 sm:h-76 md:h-80 pt-1 -ml-2 sm:ml-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={activeTrendData}
              margin={{ top: 12, right: 12, left: -10, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255, 255, 255, 0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                stroke="rgba(255, 255, 255, 0.35)"
                tick={{ fill: 'rgba(255, 255, 255, 0.55)', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255, 255, 255, 0.12)' }}
                interval={timeRange === '7D' ? 0 : timeRange === '14D' ? 1 : 4}
              />
              {/* Left Y-Axis for Safe Hours */}
              <YAxis
                yAxisId="left"
                stroke="rgba(0, 230, 118, 0.5)"
                tick={{ fill: '#00E676', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
                domain={['dataMin - 4000', 'dataMax + 4000']}
                tickFormatter={(val: number) => `${(val / 1000000).toFixed(2)}M`}
              />
              {/* Right Y-Axis for Active Hazards */}
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="rgba(255, 82, 82, 0.5)"
                tick={{ fill: '#FF5252', fontSize: 11, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={false}
                domain={[0, 8]}
                tickFormatter={(val: number) => `${val}h`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const safeHoursVal = payload.find((p: any) => p.dataKey === 'safeHours')?.value;
                    const hazardsVal = payload.find((p: any) => p.dataKey === 'activeHazards')?.value;

                    return (
                      <div className="apple-glass p-3.5 rounded-2xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-3xl text-xs font-mono space-y-2.5 min-w-[240px] pointer-events-none animate-in fade-in zoom-in-95 duration-100">
                        {/* Tooltip Header */}
                        <div className="flex items-center justify-between border-b border-white/10 pb-2">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-[#00E676]" />
                            <span className="font-bold text-white text-[12px]">{label} 2026</span>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-neutral-300 font-medium">
                            Pit Jaja KM10
                          </span>
                        </div>

                        {/* Metric 1: Safe Hours */}
                        <div className="flex items-center justify-between gap-3 text-[11px] bg-white/[0.04] p-2 rounded-xl border border-white/5">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#00E676] shadow-[0_0_8px_#00E676]" />
                            <span className="text-neutral-300 font-medium font-sans">Jam Kerja Selamat:</span>
                          </div>
                          <div className="text-right">
                            <div className="text-[#00E676] font-bold tabular-nums">
                              {Number(safeHoursVal ?? 0).toLocaleString('id-ID')} Jam
                            </div>
                            <div className="text-[9px] text-neutral-400 font-sans">0 Incident · LTI Free</div>
                          </div>
                        </div>

                        {/* Metric 2: Active Hazards */}
                        <div className="flex items-center justify-between gap-3 text-[11px] bg-white/[0.04] p-2 rounded-xl border border-white/5">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5252] shadow-[0_0_8px_#FF5252]" />
                            <span className="text-neutral-300 font-medium font-sans">Hazard Aktif:</span>
                          </div>
                          <div className="text-right">
                            <div className="text-red-400 font-bold tabular-nums">
                              {hazardsVal ?? 0} Temuan
                            </div>
                            <div className="text-[9px] font-sans">
                              {Number(hazardsVal ?? 0) <= 2 ? (
                                <span className="text-emerald-400">Terkendali Baik</span>
                              ) : (
                                <span className="text-amber-400">Monitoring Khusus</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Tooltip Footer */}
                        <div className="flex items-center justify-between pt-1 text-[10px] text-neutral-400 border-t border-white/5 font-sans">
                          <span>Shift 1 &amp; 2 Terverifikasi</span>
                          <span className="text-emerald-400 font-mono">100% Safe</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontFamily: 'monospace' }}
                formatter={(value) => <span className="text-neutral-300 font-medium mr-2">{value}</span>}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="safeHours"
                name="Safe Hours"
                stroke="#00E676"
                strokeWidth={2.5}
                dot={timeRange === '7D'}
                activeDot={{ r: 5, fill: '#00E676', stroke: '#090909', strokeWidth: 2 }}
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
                activeDot={{ r: 5, fill: '#FF5252', stroke: '#090909', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Operations Overview & Realtime Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Mining Zones & Operations Status */}
        <div className="lg:col-span-2 space-y-6">
          {/* Mining Site Zones Telemetry */}
          <div className="apple-glass-card p-5 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#00E676]" />
                <h3 className="font-semibold text-sm text-white">Status Zona Operasi Pertambangan CGG</h3>
              </div>
              <button
                onClick={() => store.openWindow('map')}
                className="text-xs text-[#00E676] hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                Buka Peta GIS Lengkap <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {store.locations.map((loc) => (
                <div
                  key={loc.id}
                  onClick={() => store.openWindow('map')}
                  className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            loc.safetyStatus === 'SAFE'
                              ? 'bg-emerald-400'
                              : loc.safetyStatus === 'WARNING'
                              ? 'bg-amber-400'
                              : 'bg-red-400 animate-ping'
                          }`}
                        />
                        {loc.name}
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono mt-0.5">{loc.utm}</div>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        loc.activeHazards > 0
                          ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {loc.activeHazards} Bahaya
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-300 mt-2 line-clamp-1">{loc.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Action Matrix */}
          <div className="apple-glass-card p-5 rounded-2xl">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#42A5F5]" />
              Aksi Cepat Operasional HSE Lapangan
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={() => store.openWindow('inspection')}
                className="p-3 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-200 text-left transition-all cursor-pointer group"
              >
                <Plus className="w-4 h-4 text-blue-400 mb-1 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-semibold text-white">Input Inspeksi</div>
                <div className="text-[10px] text-blue-300">Form digital APAR, P2H</div>
              </button>

              <button
                onClick={() => store.openWindow('hazard')}
                className="p-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-200 text-left transition-all cursor-pointer group"
              >
                <AlertTriangle className="w-4 h-4 text-red-400 mb-1 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-semibold text-white">Lapor Hazard</div>
                <div className="text-[10px] text-red-300">5x5 Risk Matrix & Foto</div>
              </button>

              <button
                onClick={() => store.openWindow('ai')}
                className="p-3 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-200 text-left transition-all cursor-pointer group"
              >
                <Flame className="w-4 h-4 text-purple-400 mb-1 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-semibold text-white">AI Hazard Scan</div>
                <div className="text-[10px] text-purple-300">Deteksi APD & Wheel Chock</div>
              </button>

              <button
                onClick={() => store.openWindow('sync')}
                className="p-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-200 text-left transition-all cursor-pointer group"
              >
                <CloudLightning className="w-4 h-4 text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-semibold text-white">Cloud Sync</div>
                <div className="text-[10px] text-emerald-300">Google Sheets Sync</div>
              </button>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Weather & Live Feed Widgets */}
        <div className="space-y-6">
          {/* Weather & Heat Stress Indicator */}
          <div className="apple-glass-card p-5 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-neutral-400" />
                Stasiun Cuaca Pit Jaja KM10
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-medium">
                {store.weather.pitStatus}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[11px] text-neutral-400">Temperatur Ambien</div>
                <div className="text-xl font-bold text-white font-mono tabular-nums">{store.weather.temp}°C</div>
                <div className="text-[10px] text-neutral-400">Kelembapan: {store.weather.humidity}%</div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
                <div className="text-[11px] text-amber-300 font-medium">Indeks Panas (WBGT)</div>
                <div className="text-xl font-bold text-amber-400 font-mono tabular-nums">{store.weather.wbgt}</div>
                <div className="text-[10px] text-amber-300/80">Kategori: {store.weather.heatStressLevel}</div>
              </div>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Wajib istirahat berkala 10 menit per jam kerja pada area Pit & Haul Road dan sediakan air minum elektrolit di rest shelter.
            </p>
          </div>

          {/* Section 9: Live Feed Widget */}
          <div className="apple-glass-card p-5 rounded-2xl">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[#00E676]" />
                Live Operational Feed
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">Real-time</span>
            </div>

            <div className="space-y-3">
              {store.liveFeed.map((feed) => (
                <div key={feed.id} className="flex items-start gap-2.5 text-xs">
                  <span className="font-mono text-[11px] text-neutral-400 tabular-nums shrink-0 pt-0.5">
                    {feed.time}
                  </span>
                  <div>
                    <span
                      className={`inline-block text-[10px] font-semibold px-1.5 py-0.2 rounded mr-1.5 ${
                        feed.category === 'PICA'
                          ? 'bg-amber-500/20 text-amber-300'
                          : feed.category === 'Hazard'
                          ? 'bg-red-500/20 text-red-300'
                          : feed.category === 'Inspection'
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {feed.category}
                    </span>
                    <span className="text-neutral-200 leading-snug">{feed.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
