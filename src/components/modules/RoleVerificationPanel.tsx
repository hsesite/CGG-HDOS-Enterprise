import { useEffect, useState } from 'react';
import { BadgeCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import { getCurrentUser } from '../../core/auth-utils';
import { hseApi, type ApiUser } from '../../core/api';
import { canManagePersonnel, requiresRoleVerification } from '../../core/access-policy';

const SENIOR_ROLES = ['KTT', 'Project Manager', 'SPV HSE', 'Foreman Safety', 'PJO'] as const;

export function RoleVerificationPanel() {
  const actor = getCurrentUser();
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  async function reload() {
    if (!canManagePersonnel(actor)) return;
    setLoading(true);
    try { setUsers(await hseApi.listUsers()); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Daftar akun tidak dapat dimuat.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void reload(); }, []);
  if (!canManagePersonnel(actor)) return null;

  async function verify(account: ApiUser, roleVerified: boolean) {
    setBusyId(account.id);
    setMessage('');
    try {
      await hseApi.updateUserAccess(account.id, { roleVerified });
      setMessage(roleVerified ? 'Jabatan diverifikasi; akses mengikuti kebijakan jabatan.' : 'Verifikasi dicabut; akses kembali dibatasi ke 4 modul Crew.');
      await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Status verifikasi gagal diperbarui.'); }
    finally { setBusyId(''); }
  }

  const seniorUsers = users.filter((account) => requiresRoleVerification(account));
  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-[#00E676]/20 bg-[#00E676]/[0.04] p-5">
      <header className="flex items-start gap-3">
        <div className="rounded-xl border border-[#00E676]/20 bg-[#00E676]/10 p-2"><BadgeCheck className="h-5 w-5 text-[#00E676]" /></div>
        <div><h3 className="font-semibold text-white">Verifikasi Jabatan</h3><p className="mt-1 text-sm text-neutral-400">Khusus Admin CGG. KTT, Project Manager, SPV HSE, Foreman Safety, dan PJO yang belum diverifikasi hanya mendapat 4 modul Crew: Dashboard, Repository, Inspeksi, dan Hazard.</p></div>
      </header>
      {message && <p role="status" className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-neutral-200">{message}</p>}
      <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold text-white">Akun jabatan tinggi ({seniorUsers.length})</h4><button type="button" disabled={loading} onClick={() => void reload()} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white disabled:opacity-50"><RefreshCw size={14}/>{loading ? 'Memuat...' : 'Muat ulang'}</button></div>
      {loading ? <p className="text-sm text-neutral-400">Memuat akun...</p> : seniorUsers.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-neutral-400">Belum ada akun dengan jabatan yang memerlukan verifikasi.</p> : <div className="space-y-2">{seniorUsers.map((account) => <div key={account.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="font-medium text-white">{account.displayName}</div><div className="truncate text-xs text-neutral-400">{account.email}</div><div className="mt-1 text-xs text-neutral-500">{account.roles.filter((role) => (SENIOR_ROLES as readonly string[]).includes(role)).join(', ')} · {account.companyCode || 'Perusahaan belum ditentukan'}</div></div><div className="flex items-center gap-2"><span className={`rounded-lg border px-2.5 py-1.5 text-xs ${account.roleVerified === true ? 'border-emerald-400/30 text-emerald-300' : 'border-amber-400/30 text-amber-300'}`}>{account.roleVerified === true ? 'Terverifikasi' : 'Belum diverifikasi'}</span><button type="button" disabled={Boolean(busyId) || account.id === actor?.id} onClick={() => void verify(account, account.roleVerified !== true)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{busyId === account.id ? 'Menyimpan...' : account.roleVerified === true ? 'Cabut verifikasi' : 'Verifikasi jabatan'}</button></div></div>)}</div>}
      <p className="flex items-start gap-2 text-xs text-amber-200/80"><ShieldAlert size={15} className="mt-0.5 shrink-0"/> Field roleVerified harus disimpan dan divalidasi oleh backend GAS. Deployment GAS aktif juga harus diperbarui; UI saja bukan pengaman server.</p>
    </section>
  );
}
