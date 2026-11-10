import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  CloudLightning,
  Wifi,
  WifiOff,
  Database,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  ArrowRight,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { hdosSync } from '../../core/sync';
import { hdosEvents } from '../../core/events';
import { hseApi } from '../../core/api';
import { getCurrentUser } from '../../core/auth-utils';
import { hdosBackup } from '../../core/backup';

export const SyncModule: React.FC = () => {
  const store = useHDOSStore();
  const currentUser = getCurrentUser();
  const canExport = String(currentUser?.companyCode || '').trim().toUpperCase() === 'CGG' || Boolean(currentUser?.roles.includes('Admin CGG'));
  const [online, setOnline] = useState(hdosSync.getIsOnline());
  const [syncing, setSyncing] = useState(hdosSync.getIsSyncing());
  const [refreshingCloud, setRefreshingCloud] = useState(false);
  const [queue, setQueue] = useState(hdosSync.getQueue());
  const [logs, setLogs] = useState(hdosSync.getSyncLogs());
  const [conflictDrafts, setConflictDrafts] = useState<Record<string, string>>({});
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const actionableQueue = queue.filter(item => item.status !== 'RESOLVED');
  const resolvedQueueCount = queue.length - actionableQueue.length;

  useEffect(() => {
    const un1 = hdosEvents.on('sync:offline_status_changed', (payload) => {
      setOnline(payload.online);
      setLogs(hdosSync.getSyncLogs());
    });
    const un2 = hdosEvents.on('sync:queue_updated', (q) => {
      setQueue(q);
      setLogs(hdosSync.getSyncLogs());
    });
    const un3 = hdosEvents.on('sync:started', () => setSyncing(true));
    const un4 = hdosEvents.on('sync:completed', () => {
      setSyncing(false);
      setQueue(hdosSync.getQueue());
      setLogs(hdosSync.getSyncLogs());
    });

    return () => {
      un1();
      un2();
      un3();
      un4();
    };
  }, []);

  const handleTriggerSync = async () => {
    try {
      await hdosSync.retryFailedItems();
      await hdosSync.triggerSync();
    } catch (error) {
      setLogs(current => [{
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        message: error instanceof Error ? `Sinkronisasi gagal dijalankan: ${error.message}` : 'Sinkronisasi gagal dijalankan.',
        type: 'warning' as const,
      }, ...current].slice(0, 100));
      setQueue(hdosSync.getQueue());
      setSyncing(hdosSync.getIsSyncing());
    }
  };

  const handleResolveConflict = async (queueItemId: string) => {
    const rawDraft = conflictDrafts[queueItemId];
    if (!rawDraft) return;
    setResolvingConflictId(queueItemId);
    try {
      const parsed = JSON.parse(rawDraft) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Data revisi harus berupa objek JSON.');
      }
      await hdosSync.resolveConflict(queueItemId, parsed as Record<string, unknown>);
      setConflictDrafts(current => {
        const next = { ...current };
        delete next[queueItemId];
        return next;
      });
      setQueue(hdosSync.getQueue());
      setLogs(hdosSync.getSyncLogs());
    } catch (error) {
      setLogs(current => [{
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        message: error instanceof Error ? `Penyelesaian konflik gagal: ${error.message}` : 'Penyelesaian konflik gagal.',
        type: 'warning' as const,
      }, ...current].slice(0, 100));
    } finally {
      setResolvingConflictId(null);
    }
  };

  const handleRefreshCloud = async () => {
    if (!hseApi.isAuthenticated) return;
    setRefreshingCloud(true);
    try {
      const result = await store.refreshCloudData();
      const hasFailures = result.failed.length > 0;
      setLogs(current => [{
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        message: hasFailures
          ? `Refresh sebagian: ${result.refreshed.join(', ') || 'belum ada sumber berhasil'}; gagal: ${result.failed.join(', ')}.`
          : `Database pusat berhasil diperbarui: ${result.refreshed.join(', ')}.`,
        type: hasFailures ? 'warning' as const : 'success' as const,
      }, ...current].slice(0, 100));
    } catch (error) {
      setLogs(current => [{
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        message: error instanceof Error ? `Refresh database pusat gagal: ${error.message}` : 'Refresh database pusat gagal.',
        type: 'warning' as const,
      }, ...current].slice(0, 100));
    } finally {
      setRefreshingCloud(false);
    }
  };



  const handleCreateBackup = async () => {
    setBackupBusy(true);
    setBackupMessage('');
    try {
      const result = await hdosBackup.create();
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBackupMessage(`Backup berhasil dibuat: ${result.records} record disertakan. Simpan file di lokasi aman.`);
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Pembuatan backup gagal.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const approved = window.confirm('Pemulihan akan menggabungkan data dari backup ke penyimpanan lokal. Data yang sudah ada tidak dihapus. Lanjutkan?');
    if (!approved) return;
    setBackupBusy(true);
    setBackupMessage('');
    try {
      const result = await hdosBackup.restore(file);
      setBackupMessage(`Pemulihan selesai: ${result.restored} record dipulihkan, ${result.skipped} record dilewati. Data lama yang tidak ada di backup tetap dipertahankan.`);
      setQueue(hdosSync.getQueue());
      setLogs(hdosSync.getSyncLogs());
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Pemulihan backup gagal.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleExportInspections = () => {
    hdosSync.exportToGoogleSheetsCSV(store.inspections, 'Inspections');
  };

  const handleExportHazards = () => {
    hdosSync.exportToGoogleSheetsCSV(store.hazards, 'Hazards');
  };

  const handleExportPICA = () => {
    hdosSync.exportToGoogleSheetsCSV(store.picas, 'PICA');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CloudLightning className="w-5 h-5 text-[#10B981]" />
            Offline Architecture &amp; Google Spreadsheet Sync Engine
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Blueprint §10 &amp; §11: Offline First → CGG_HDOS_DB IndexedDB → Queue → Conflict Resolution → Google Sheets.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Actual browser connectivity; no production simulation switch. */}
          <div
            role="status"
            aria-live="polite"
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              online
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
            }`}
          >
            {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4 animate-pulse" />}
            <span>Koneksi perangkat: {online ? 'Online' : 'Offline'}</span>
          </div>

          <button
            onClick={handleRefreshCloud}
            disabled={refreshingCloud || !online || !hseApi.isAuthenticated}
            className="px-3.5 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-neutral-200 font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40"
          >
            <Download className={`w-3.5 h-3.5 ${refreshingCloud ? 'animate-pulse' : ''}`} />
            <span>{refreshingCloud ? 'Mengambil Data...' : 'Ambil Data Pusat'}</span>
          </button>
          <button
            onClick={handleTriggerSync}
            disabled={syncing || !online || actionableQueue.length === 0}
            className="px-4 py-1.5 rounded-xl bg-[#00E676] hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
          </button>
        </div>
      </div>

      {/* Sync Flow & Architecture Graphic */}
      <div className="apple-glass-card p-5 rounded-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs font-semibold text-white">
          <span className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#10B981]" />
            Alur Sinkronisasi Data Master (Zero Data Loss)
          </span>
          <span className="font-mono text-[11px] text-neutral-400">
            Terakhir Sinkron: {hdosSync.getLastSyncTime()} WITA
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1">
            <div className="text-[10px] uppercase font-mono text-[#00E676] font-bold">Langkah 1</div>
            <div className="font-bold text-white">Lokal Input di Pit</div>
            <div className="text-[11px] text-neutral-400">Pekerja mengisi form tanpa internet di tambang.</div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1">
            <div className="text-[10px] uppercase font-mono text-amber-400 font-bold">Langkah 2</div>
            <div className="font-bold text-white">CGG_HDOS_DB (IndexedDB)</div>
            <div className="text-[11px] text-neutral-400">Data tersimpan di 12 object stores lokal.</div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1">
            <div className="text-[10px] uppercase font-mono text-blue-400 font-bold">Langkah 3</div>
            <div className="font-bold text-white">Antrean Queue Engine</div>
            <div className="text-[11px] text-neutral-400">Status pending dengan retry exponential backoff.</div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1">
            <div className="text-[10px] uppercase font-mono text-purple-400 font-bold">Langkah 4</div>
            <div className="font-bold text-white">Google Sheet Central</div>
            <div className="text-[11px] text-neutral-400">Otomatis sinkron saat sinyal 4G/WiFi pulih.</div>
          </div>
        </div>
      </div>

      {/* Grid: Pending Queue + Sync Audit Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Queue Table */}
        <div className="apple-glass-card p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
              Antrean Sinkronisasi (Aktif: {actionableQueue.length} · Arsip: {resolvedQueueCount})
            </span>
            <span className="text-[10px] font-mono text-amber-400">
              {actionableQueue.length > 0 ? 'Operasi menunggu / perlu ditinjau' : resolvedQueueCount > 0 ? 'Tidak ada operasi tertunda' : 'Antrean kosong'}
            </span>
          </div>

          {queue.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
              <p>Tidak ada item yang sedang menunggu di antrean sinkronisasi.</p>
              {!hseApi.baseUrl && (
                <p className="text-[11px] text-amber-300">
                  Endpoint cloud belum dikonfigurasi. Data lokal belum dapat dianggap tersinkron ke Google Spreadsheet.
                </p>
              )}
              {hseApi.baseUrl && !hseApi.isAuthenticated && (
                <p className="text-[11px] text-amber-300">
                  Sesi cloud belum aktif. Antrean kosong tidak membuktikan seluruh data lokal telah tersinkron.
                </p>
              )}
              <p className="text-[11px] text-neutral-500">
                Antrean kosong hanya berarti tidak ada operasi yang menunggu; verifikasi status cloud secara terpisah.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {queue.map((item) => (
                <div key={item.id} className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-amber-300 font-bold uppercase text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20">
                        {item.action} {item.entity}
                      </span>
                      <span className="text-neutral-400 text-[10px] font-mono">
                        {item.timestamp.replace('T', ' ').substring(0, 19)}
                      </span>
                    </div>
                    <div className="text-white font-medium mt-1 truncate max-w-xs">
                      {(() => {
                        const payload = item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
                          ? item.payload as Record<string, unknown>
                          : {};
                        const p2hInput = payload.input && typeof payload.input === 'object' && !Array.isArray(payload.input)
                          ? payload.input as Record<string, unknown>
                          : {};
                        if (item.entity === 'contractor-report') {
                          return typeof p2hInput.period === 'string' ? `Laporan kepatuhan periode ${p2hInput.period}` : 'Laporan kepatuhan Contractor';
                        }
                        if (item.entity === 'contractor-sia') {
                          const fileName = typeof payload.fileName === 'string' ? payload.fileName : 'Dokumen SIA';
                          return `Dokumen SIA · ${fileName}`;
                        }
                        if (item.entity === 'contractor' && typeof payload.fleetId === 'string') {
                          const date = typeof p2hInput.inspectionDate === 'string' ? p2hInput.inspectionDate : '';
                          const unit = typeof payload.unitNumber === 'string' ? payload.unitNumber : payload.fleetId;
                          return `P2H ${unit}${date ? ` · ${date}` : ''}`;
                        }
                        const label = payload.title ?? payload.code ?? payload.findingDescription;
                        return typeof label === 'string' && label.trim()
                          ? label
                          : 'Data antrean';
                      })()}
                    </div>
                  </div>

                  <div className="text-right max-w-[48%]">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      item.status === 'CONFLICT'
                        ? 'bg-red-500/15 text-red-300'
                        : item.status === 'RESOLVED'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : item.status === 'SYNCING'
                        ? 'bg-blue-500/15 text-blue-300'
                        : 'bg-white/10 text-neutral-300'
                    }`}>
                      {item.status === 'RESOLVED' ? 'RESOLVED · TEREKONSILIASI' : item.status}
                    </span>
                    {item.retryCount > 0 && (
                      <div className="text-[10px] text-amber-300 mt-1">
                        Percobaan: {item.retryCount}/5
                      </div>
                    )}
                    {item.error && (
                      <div className="text-[10px] text-red-300 mt-1 break-words" title={item.error}>
                        {item.error}
                      </div>
                    )}
                    {item.status === 'CONFLICT' && item.conflictServerRecord && (
                      <details className="mt-2 text-left">
                        <summary className="cursor-pointer text-[10px] text-amber-300">
                          Bandingkan versi server
                        </summary>
                        <div className="mt-1 rounded-lg border border-amber-500/20 bg-black/20 p-2">
                          <div className="text-[10px] text-neutral-400 mb-1">
                            Server diperbarui: {String(item.conflictServerRecord.updatedAt || 'Waktu tidak tersedia')}
                          </div>
                          <div className="text-[10px] font-semibold text-neutral-300 mb-1">Perubahan lokal yang tertahan</div>
                          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] text-neutral-400">
                            {JSON.stringify(item.payload, null, 2)}
                          </pre>
                          <div className="text-[10px] font-semibold text-neutral-300 mt-2 mb-1">Data terbaru dari server</div>
                          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] text-neutral-300">
                            {JSON.stringify(item.conflictServerRecord, null, 2)}
                          </pre>
                          <p className="text-[10px] text-amber-200 mt-2">
                            Payload lokal tetap tersimpan sebagai bukti perubahan. Salin perubahan yang ingin dipertahankan ke draf di bawah ini. Draf awal memakai versi server; tidak ada penggabungan otomatis.
                          </p>
                          {item.action === 'UPDATE' && typeof item.conflictServerRecord.updatedAt === 'string' && (
                            <div className="mt-3 space-y-2">
                              <label className="block text-[10px] font-semibold text-neutral-200" htmlFor={`conflict-draft-${item.id}`}>
                                Data revisi berdasarkan versi server (JSON)
                              </label>
                              <textarea
                                id={`conflict-draft-${item.id}`}
                                value={conflictDrafts[item.id] ?? JSON.stringify(item.conflictServerRecord, null, 2)}
                                onChange={event => setConflictDrafts(current => ({ ...current, [item.id]: event.target.value }))}
                                rows={10}
                                spellCheck={false}
                                className="w-full rounded-lg border border-white/15 bg-black/40 p-2 font-mono text-[10px] text-neutral-200 outline-none focus:border-emerald-400"
                              />
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[10px] text-neutral-400">
                                  Versi dasar: {String(item.conflictServerRecord.updatedAt)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void handleResolveConflict(item.id)}
                                  disabled={resolvingConflictId === item.id || !online || !hseApi.isAuthenticated}
                                  className="rounded-lg bg-emerald-500 px-3 py-2 text-[10px] font-bold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {resolvingConflictId === item.id ? 'Menyimpan revisi...' : 'Simpan Revisi & Antrekan Ulang'}
                                </button>
                              </div>
                              <p className="text-[10px] text-neutral-400">
                                Sistem mengunci ID, versi dasar, dan identitas tenant dari snapshot server. Revisi akan dikirim sebagai UPDATE baru; validasi dan otorisasi server tetap berlaku.
                              </p>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sync Audit Trail Logs */}
        <div className="apple-glass-card p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
              Log Aktivitas &amp; Audit Trail Jaringan
            </span>
            <span className="text-[10px] font-mono text-neutral-400">System Log</span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto font-mono text-xs">
            {logs.map((log, i) => (
              <div key={i} className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex items-start gap-2.5 text-[11px]">
                <span className="text-neutral-400 tabular-nums shrink-0">{log.time}</span>
                <span
                  className={
                    log.type === 'success'
                      ? 'text-emerald-300'
                      : log.type === 'warning'
                      ? 'text-amber-300'
                      : 'text-neutral-300'
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Full local backup and merge restore */}
      <section className="apple-glass-card p-5 rounded-2xl space-y-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <Database className="w-4 h-4 text-emerald-400" />
          <div>
            <h3 className="text-sm font-bold text-white">Backup & Pemulihan Data HDOS</h3>
            <p className="text-xs text-neutral-400 mt-1">Cadangan data lokal operasional, dokumen, foto, formulir, dan antrean sinkronisasi.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button type="button" onClick={() => void handleCreateBackup()} disabled={backupBusy}
            className="min-h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm px-4 py-3 disabled:opacity-50">
            {backupBusy ? 'Memproses...' : 'Buat & Unduh Backup'}
          </button>
          <label className="min-h-12 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white font-semibold text-sm px-4 py-3 flex items-center justify-center cursor-pointer">
            Pilih File untuk Pemulihan
            <input type="file" accept=".json,application/json" className="sr-only" disabled={backupBusy}
              onChange={event => void handleRestoreBackup(event)} />
          </label>
        </div>
        {backupMessage && <p role="status" aria-live="polite" className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-neutral-200 break-words">{backupMessage}</p>}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200 space-y-1">
          <p className="font-semibold">Catatan pemulihan</p>
          <p>Backup memuat data operasional sensitif. Simpan file di media/lokasi yang terlindungi. Pemulihan hanya menerima cakupan perusahaan yang sama, memeriksa checksum, dan menggabungkan data tanpa menghapus data lokal yang sudah ada.</p>
          <p>Antrean aktif dari backup dikembalikan menjadi menunggu sinkronisasi. Kredensial dan konfigurasi sesi tidak disertakan.</p>
        </div>
      </section>

      {/* Google Sheets Integration Export Center */}
      <div className="apple-glass-card p-5 rounded-2xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#10B981]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
              Ekspor Data Terformat Google Spreadsheet / CSV SMKP
            </h3>
          </div>
          <span className="text-xs text-neutral-400">Kompatibel Google Drive &amp; Excel</span>
        </div>

        {canExport ? <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={handleExportInspections}
            className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all flex items-center justify-between cursor-pointer group"
          >
            <div>
              <div className="text-xs font-bold text-white">Ekspor Data Inspeksi</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">{store.inspections.length} baris rekaman</div>
            </div>
            <Download className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          </button>

          <button
            onClick={handleExportHazards}
            className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all flex items-center justify-between cursor-pointer group"
          >
            <div>
              <div className="text-xs font-bold text-white">Ekspor Data Hazard</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">{store.hazards.length} baris rekaman</div>
            </div>
            <Download className="w-4 h-4 text-red-400 group-hover:scale-110 transition-transform" />
          </button>

          <button
            onClick={handleExportPICA}
            className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all flex items-center justify-between cursor-pointer group"
          >
            <div>
              <div className="text-xs font-bold text-white">Ekspor Data PICA</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">{store.picas.length} baris rekaman</div>
            </div>
            <Download className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          </button>
        </div> : <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-neutral-400">Fitur unduh/ekspor hanya tersedia untuk akun internal CGG. Akun kontraktor dan subkon dapat melihat data sesuai cakupan perusahaan.</p>}
      </div>
    </div>
  );
};
