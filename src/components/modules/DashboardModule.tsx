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
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useHDOSStore } from '../../core/store';
import { hdosSync } from '../../core/sync';
import { AuthState } from '../../core/auth-state';

export const DashboardModule: React.FC = () => {
  const store = useHDOSStore();
  const sessionUser = AuthState.getUser();
  const roles = sessionUser?.roles || [];
  const companyCode = String(sessionUser?.companyCode || '').trim().toUpperCase();
  // Match backend Admin CGG identity requirements; a role label alone must not
  // unlock enterprise-wide dashboard aggregation for another tenant.
  const isOwnerAdmin = companyCode === 'CGG' && roles.includes('Admin CGG');
  const isOversight = companyCode === 'CGG' && sessionUser?.roleVerified === true && roles.some((role) => ['KTT', 'SPT', 'SPV', 'Project Manager', 'PJO', 'SPV HSE', 'Foreman Safety'].includes(role));
  const isContractor = store.contractors.some(company => company.code.toUpperCase() === companyCode && company.companyRole === 'Contractor');
  const isSubcontractor = Boolean(sessionUser?.parentCompanyCode) || store.contractors.some(company => company.code.toUpperCase() === companyCode && company.companyRole === 'Subkon');
  const childSubcontractors = isContractor
    ? store.contractors.filter(company => company.companyRole === 'Subkon' && String(company.parentCompanyCode || '').trim().toUpperCase() === companyCode && company.status !== 'SUSPENDED')
    : [];
  const tenantDashboardCodes = isContractor
    ? [companyCode, ...childSubcontractors.map(company => company.code.trim().toUpperCase())]
    : isSubcontractor ? [companyCode] : [];
  const dashboardTitle = isOwnerAdmin ? 'Dashboard Owner CGG' : isOversight ? 'Dashboard Pengawasan CGG' : isContractor ? `Dashboard ${companyCode}` : isSubcontractor ? `Dashboard Subkon ${companyCode}` : `Dashboard ${companyCode || 'Perusahaan'}`;
  const cloudRefreshLabel = store.lastCloudRefreshAt ? new Date(store.lastCloudRefreshAt).toLocaleString('id-ID') : 'Belum ada snapshot cloud pada sesi ini';
  const cloudRefreshWarning = store.cloudRefreshFailedSources.length > 0 ? ` · Sumber gagal: ${store.cloudRefreshFailedSources.join(', ')}` : '';

  const dashboardDescription = isOwnerAdmin
    ? 'Konsolidasi seluruh perusahaan dan wilayah dalam HDOS.'
    : isOversight
      ? 'Cakupan pengawasan seluruh kontraktor aktif dan subkontraktor terdaftar sesuai master perusahaan.'
      : isContractor
        ? `Data ${companyCode} dan subkontraktor yang terdaftar di bawah perusahaan ini.`
        : isSubcontractor
          ? 'Data terbatas pada perusahaan subkontraktor Anda.'
          : 'Data operasional sesuai perusahaan dan hak akses akun Anda.';

  // Dashboard summaries are filtered again in the browser for offline data already cached on this device.
  // Server-side tenant filtering remains authoritative for every API request.
  const recordInDashboardScope = (record: unknown): boolean => {
    if (isOwnerAdmin) return true;
    const item = record as Record<string, unknown>;
    const recordCompany = String(item.companyCode || item.contractorCode || item.ownerCompanyCode || '').trim().toUpperCase();
    const recordSubkon = String(item.subcontractorCode || item.subkonCode || '').trim().toUpperCase();
    const recordParent = String(item.parentCompanyCode || '').trim().toUpperCase();
    if (isOversight) { const allowed = new Set(store.contractors.flatMap(company => [company.code, company.parentCompanyCode || '']).map(code => String(code).trim().toUpperCase()).filter(Boolean)); return allowed.has(recordCompany) || allowed.has(recordParent) || allowed.has(recordSubkon); }
    if (!companyCode) return false;
    if (isSubcontractor) return recordCompany === companyCode || recordSubkon === companyCode;
    if (isContractor) { const allowed = new Set(tenantDashboardCodes); return allowed.has(recordCompany) || allowed.has(recordParent) || allowed.has(recordSubkon); }
    return recordCompany === companyCode || recordSubkon === companyCode;
  };
  const dashboardInspections = store.inspections.filter(recordInDashboardScope);
  const dashboardHazards = store.hazards.filter(recordInDashboardScope);
  const dashboardPicas = store.picas.filter(recordInDashboardScope);

  const completedInspections = dashboardInspections.filter(record => record.status === 'COMPLETED' || record.status === 'PICA_TRIGGERED');
  const totalInspections = completedInspections.length;
  const complianceScore = totalInspections > 0 ? completedInspections.reduce((total, record) => total + Number(record.scorePercent || 0), 0) / totalInspections : null;
  const openHazards = dashboardHazards.filter((h) => h.status !== 'CLOSED').length;
  const criticalHazards = dashboardHazards.filter((h) => h.status !== 'CLOSED' && h.riskMatrix?.level === 'CRITICAL').length;
  const activePicas = dashboardPicas.filter((p) => p.status !== 'CLOSED').length;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const overduePicas = dashboardPicas.filter((p) =>
    p.status !== 'CLOSED' && p.status !== 'WAITING_HSE' &&
    Boolean(p.targetDate) && String(p.targetDate).slice(0, 10) < todayKey
  ).length;

  const [timeRange, setTimeRange] = useState<'7D' | '14D' | '30D'>('30D');

  // Show contractor/subcontractor comparison to CGG oversight and each contractor.
  // A contractor sees itself plus registered child subcontractors; a subkon sees only itself.
  const canSeeCompanyComparison = isOwnerAdmin || isOversight || isContractor || isSubcontractor;
  const dashboardCompanyCodes = isOwnerAdmin
    ? ['CGG', ...store.contractors.filter(company => company.status !== 'SUSPENDED').map(company => company.code.trim().toUpperCase()).filter(Boolean)]
    : isOversight
      ? store.contractors.filter(company => company.status !== 'SUSPENDED').map(company => company.code.trim().toUpperCase()).filter(Boolean)
      : tenantDashboardCodes;
  const companyDashboardRows = canSeeCompanyComparison
    ? [...new Set(dashboardCompanyCodes)].map((code) => {
        const ownedBy = (record: unknown) => {
          const item = record as Record<string, unknown>;
          return String(item.subcontractorCode || item.subkonCode || item.companyCode || item.contractorCode || item.ownerCompanyCode || '').trim().toUpperCase();
        };
        const inspections = dashboardInspections.filter((record) => ownedBy(record) === code).length;
        const hazards = dashboardHazards.filter((record) => ownedBy(record) === code).length;
        const picas = dashboardPicas.filter((record) => ownedBy(record) === code).length;
        return { code, inspections, hazards, picas, total: inspections + hazards + picas };
      })
    : [];


  // Build daily activity from actual records in the selected period; never synthesize values.
  const activeTrendData = useMemo(() => {
    const days = Number(timeRange.replace('D', ''));
    const todayLocal = new Date();
    todayLocal.setHours(0, 0, 0, 0);
    const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const buckets = new Map<string, { date: string; inspections: number; hazards: number; incidents: number; picas: number }>();
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(todayLocal);
      date.setDate(todayLocal.getDate() - offset);
      const key = dateKey(date);
      buckets.set(key, { date: key.slice(5).replace('-', '/'), inspections: 0, hazards: 0, incidents: 0, picas: 0 });
    }
    const add = (records: Array<{ date?: string; createdAt?: string }>, metric: 'inspections' | 'hazards' | 'incidents' | 'picas') => {
      records.forEach(record => {
        const key = String(record.date || record.createdAt || '').slice(0, 10);
        const bucket = buckets.get(key);
        if (bucket) bucket[metric] += 1;
      });
    };
    add(dashboardInspections, 'inspections');
    add(dashboardHazards, 'hazards');
    add(store.incidents.filter(recordInDashboardScope), 'incidents');
    add(dashboardPicas, 'picas');
    return [...buckets.values()];
  }, [timeRange, dashboardInspections, dashboardHazards, dashboardPicas, store.incidents]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="apple-glass-card rounded-2xl border border-[#00E676]/20 p-5 space-y-1"><h2 className="text-lg font-bold text-white">{dashboardTitle}</h2><p className="text-xs text-neutral-400">{dashboardDescription}</p><p className="text-[10px] text-neutral-500">Cakupan data mengikuti otorisasi perusahaan pada server.</p><p className="text-[10px] text-neutral-500">Snapshot database pusat terakhir: {cloudRefreshLabel}{cloudRefreshWarning}</p></header>

      {/* Executive KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Safe Man Hours */}
        <div className="apple-glass-card p-4 rounded-2xl relative overflow-hidden group">
          <div className="flex items-center justify-between text-neutral-400 text-xs mb-2">
            <span className="font-medium">Jam Kerja Selamat (LTI-Free)</span>
            <ShieldCheck className="w-4 h-4 text-[#00E676]" />
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-mono tabular-nums">
            {isOwnerAdmin && store.safeHours > 0 ? store.safeHours.toLocaleString('id-ID') : '—'}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
            <span className={`w-2 h-2 rounded-full ${isOwnerAdmin && store.safeHours > 0 ? "bg-[#00E676]" : "bg-neutral-500"}`} />
            <span>{isOwnerAdmin && store.safeHours > 0 ? 'Data jam kerja konsolidasi' : 'Menunggu data jam kerja per perusahaan'}</span>
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
            <span>Tingkat Kepatuhan: <strong className="text-white font-mono">{complianceScore === null ? '—' : `${complianceScore.toFixed(1)}%`}</strong></span>
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

      {canSeeCompanyComparison && (
        <section className="apple-glass-card p-5 rounded-2xl space-y-4 border border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">Rekapitulasi Data HSE per Perusahaan</h3>
              <p className="text-[11px] text-neutral-400">{isOwnerAdmin ? 'Konsolidasi perusahaan pada master pusat.' : isOversight ? 'Perbandingan kontraktor dan subkontraktor aktif dalam cakupan pengawasan CGG.' : isContractor ? 'Perbandingan aktivitas perusahaan Anda dengan subkontraktor yang terdaftar di bawahnya.' : 'Ringkasan aktivitas perusahaan subkontraktor Anda.'}</p>
            </div>
            <span className="text-[10px] text-emerald-300 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-1">{isOwnerAdmin ? 'Admin CGG' : isOversight ? 'Cakupan Pengawasan' : isContractor ? 'Contractor + Subkon' : 'Subkon'}</span>
          </div>
          <div className="w-full h-[340px] sm:h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={companyDashboardRows}
                layout="vertical"
                margin={{ top: 8, right: 20, left: 8, bottom: 8 }}
                barCategoryGap="24%"
              >
                <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  stroke="rgba(255,255,255,0.35)"
                  tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="code"
                  width={52}
                  stroke="rgba(255,255,255,0.35)"
                  tick={{ fill: '#FFFFFF', fontSize: 11, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ background: '#171717', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#FFFFFF', fontSize: 12 }}
                  formatter={(value, name) => [Number(value ?? 0).toLocaleString('id-ID'), String(name)]}
                  labelFormatter={(label) => `Perusahaan: ${label}`}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#D4D4D4' }} />
                <Bar dataKey="inspections" name="Inspeksi" fill="#42A5F5" radius={[0, 4, 4, 0]} maxBarSize={16} />
                <Bar dataKey="hazards" name="Hazard" fill="#FF6B6B" radius={[0, 4, 4, 0]} maxBarSize={16} />
                <Bar dataKey="picas" name="PICA" fill="#FFC107" radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-neutral-500">Grafik menampilkan jumlah inspeksi, temuan bahaya, dan PICA berdasarkan data aktual yang tersedia. Perusahaan tanpa data tetap ditampilkan dengan nilai nol.</p>
        </section>
      )}

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
                Data Historis
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Tren hanya akan tersedia setelah data aktual dan historis tercatat.
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
          {activeTrendData.every((item) => item.inspections + item.hazards + item.incidents + item.picas === 0) ? <div className="flex h-full items-center justify-center text-xs text-neutral-500">Belum ada data aktual pada periode ini.</div> : <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={activeTrendData}
              margin={{ top: 12, right: 12, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="rgba(255,255,255,0.35)"
                tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
                interval={timeRange === '7D' ? 0 : timeRange === '14D' ? 1 : 4}
              />
              <YAxis
                allowDecimals={false}
                stroke="rgba(255,255,255,0.35)"
                tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#171717', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#fff', fontSize: 11 }}
                labelStyle={{ color: '#fff', fontWeight: 700 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }} />
              <Bar dataKey="inspections" name="Inspeksi" fill="#42A5F5" radius={[3, 3, 0, 0]} />
              <Bar dataKey="hazards" name="Hazard" fill="#FF5252" radius={[3, 3, 0, 0]} />
              <Bar dataKey="incidents" name="Insiden" fill="#F59E0B" radius={[3, 3, 0, 0]} />
              <Bar dataKey="picas" name="PICA" fill="#A78BFA" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>}
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
              {(isOwnerAdmin || isOversight ? store.locations : []).map((loc) => (
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
                Stasiun Cuaca — Belum Dikonfigurasi
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-medium">
                {store.weather.pitStatus ?? 'Belum ada data'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[11px] text-neutral-400">Temperatur Ambien</div>
                <div className="text-xl font-bold text-white font-mono tabular-nums">{store.weather.temp == null ? '—' : `${store.weather.temp}°C`}</div>
                <div className="text-[10px] text-neutral-400">Kelembapan: {store.weather.humidity == null ? '—' : `${store.weather.humidity}%`}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
                <div className="text-[11px] text-amber-300 font-medium">Indeks Panas (WBGT)</div>
                <div className="text-xl font-bold text-amber-400 font-mono tabular-nums">{store.weather.wbgt ?? '—'}</div>
                <div className="text-[10px] text-amber-300/80">Kategori: {store.weather.heatStressLevel ?? 'Belum diisi'}</div>
              </div>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Data cuaca belum terhubung. Terapkan prosedur pengendalian heat stress yang berlaku dan masukkan hasil pengukuran aktual.
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
              {(isOwnerAdmin ? store.liveFeed : []).map((feed) => (
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
