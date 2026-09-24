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

export const SyncModule: React.FC = () => {
  const store = useHDOSStore();
  const [online, setOnline] = useState(hdosSync.getIsOnline());
  const [syncing, setSyncing] = useState(hdosSync.getIsSyncing());
  const [queue, setQueue] = useState(hdosSync.getQueue());
  const [logs, setLogs] = useState(hdosSync.getSyncLogs());

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

  const handleToggleOnline = () => {
    const s = hdosSync.toggleOnlineSimulation();
    setOnline(s);
  };

  const handleTriggerSync = async () => {
    await hdosSync.triggerSync();
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
          {/* Online / Offline Switch */}
          <button
            onClick={handleToggleOnline}
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              online
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
            }`}
          >
            {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4 animate-pulse" />}
            <span>Mode: {online ? 'Online (Terkoneksi)' : 'Offline (Area Blankspot Pit)'}</span>
          </button>

          <button
            onClick={handleTriggerSync}
            disabled={syncing || !online || queue.length === 0}
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
              Antrean Sinkronisasi (Queue: {queue.length})
            </span>
            <span className="text-[10px] font-mono text-amber-400">
              {queue.length > 0 ? 'Menunggu koneksi / pemicu' : 'Seluruh antrean bersih'}
            </span>
          </div>

          {queue.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
              <p>Seluruh entitas inspeksi, bahaya &amp; PICA telah 100% tersinkronisasi ke cloud.</p>
              <p className="text-[11px] text-neutral-500">
                (Untuk menguji antrean offline, aktifkan tombol mode Offline di atas lalu buat data baru).
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
                      {item.payload?.title || item.payload?.code || item.payload?.findingDescription}
                    </div>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-neutral-300">
                    {item.status}
                  </span>
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        </div>
      </div>
    </div>
  );
};
