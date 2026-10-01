import React, { useState } from 'react';
import { CloudLightning, RefreshCw } from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { apiIntegration } from '../../core/api-integration';

interface RemoteRefreshControlProps {
  label: string;
}

export const RemoteRefreshControl: React.FC<RemoteRefreshControlProps> = ({ label }) => {
  const store = useHDOSStore();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const handleRefresh = async () => {
    setNotice('');
    setError('');

    try {
      const result = await apiIntegration.hydrateRemoteData({ syncQueuedFirst: true, failIfUnauthenticated: true });
      setNotice(
        result.syncedQueueFirst
          ? `${label}: antrean lokal disinkronkan lalu data backend dimuat ulang.`
          : `${label}: data backend berhasil dimuat ulang.`
      );
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : `Gagal memuat ulang data ${label.toLowerCase()}.`);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-2 text-[11px]">
          <span
            className={`px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
              store.isRemoteHydrating
                ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                : store.lastRemoteHydrationError
                  ? 'bg-red-500/15 border-red-500/30 text-red-200'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <CloudLightning className={`w-3.5 h-3.5 ${store.isRemoteHydrating ? 'animate-pulse' : ''}`} />
            <span>
              {store.isRemoteHydrating
                ? 'Sedang tarik data backend...'
                : store.lastRemoteHydratedAt
                  ? `Refresh terakhir ${new Date(store.lastRemoteHydratedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                  : 'Belum ada refresh backend'}
            </span>
          </span>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={store.isRemoteHydrating}
          className="px-3 py-1.5 rounded-xl bg-blue-500/80 hover:bg-blue-400 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${store.isRemoteHydrating ? 'animate-spin' : ''}`} />
          <span>Refresh {label}</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
          {notice}
        </div>
      )}

      {(error || store.lastRemoteHydrationError) && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs">
          {error || store.lastRemoteHydrationError}
        </div>
      )}
    </div>
  );
};
