import { useEffect, useRef, useState } from 'react';
import type { ReactElement, FormEvent } from 'react';
import cggLogo from '../../../logo-cgg.png.jpeg';
import { loginUser } from '../../core/auth-utils';
import { AuthState } from '../../core/auth-state';
import { ApiError, hseApi } from '../../core/api';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void; auto_select?: boolean }) => void;
          renderButton: (parent: HTMLElement, options: { theme?: string; size?: string; shape?: string; text?: string; width?: number }) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }): ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleCredential, setGoogleCredential] = useState('');
  const [registrationIntent, setRegistrationIntent] = useState(false);
  const registrationIntentRef = useRef(false);
  const [googleProfile, setGoogleProfile] = useState({ displayName: '', companyCode: '', position: '', department: '', section: '' });
  const [companies, setCompanies] = useState<Array<{ code: string; name: string; role: string; parentCompanyCode?: string }>>([]);
  const registrationCompanies = [{ code: 'CGG', name: 'PT Cahaya Ginda Ganda (CGG)', role: 'CGG' }, ...companies.filter((company) => company.code.trim().toUpperCase() !== 'CGG')];

  useEffect(() => {
    void hseApi.listPublicCompanies().then((items) => {
      setCompanies(items);
      if (items.length) setGoogleProfile((profile) => ({ ...profile, companyCode: items.some((item) => item.code === profile.companyCode) ? profile.companyCode : '' }));
    }).catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || document.getElementById('google-identity-services')) return;
    const script = document.createElement('script');
    script.id = 'google-identity-services';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setGoogleReady(true);
    script.onerror = () => setError('Layanan Google Sign-In gagal dimuat. Periksa koneksi internet.');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleReady) return;
    const googleId = window.google?.accounts?.id;
    const host = document.getElementById('google-signin-button');
    if (!googleId || !host) return;

    googleId.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async ({ credential }) => {
        const forRegistration = registrationIntentRef.current;
        setError('');
        setNotice('');
        setPending(true);
        try {
          if (forRegistration) {
            setGoogleCredential(credential);
            setNotice('Google terverifikasi. Lengkapi profil; akun baru akan aktif langsung dengan akses sesuai perusahaan.');
            registrationIntentRef.current = false;
            setRegistrationIntent(false);
            return;
          }
          const user = await hseApi.loginWithGoogle(credential);
          await completeLogin(user);
        } catch (err) {
          if (err instanceof ApiError && err.status === 403 && err.message.toLowerCase().includes('belum didaftarkan')) {
            setGoogleCredential(credential);
            setNotice('Akun Google terverifikasi. Lengkapi profil untuk membuat akun dan langsung masuk ke HDOS.');
          } else {
            setError(err instanceof Error ? err.message : 'Login Google gagal.');
          }
        } finally {
          setPending(false);
        }
      },
      auto_select: false,
    });

    host.replaceChildren();
    googleId.renderButton(host, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'signin_with',
      width: Math.min(host.clientWidth || 360, 400),
    });

    return () => host.replaceChildren();
  }, [googleReady]);

  async function completeLogin(user: Awaited<ReturnType<typeof loginUser>>) {
    AuthState.saveUser(user);
    onLoggedIn();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setNotice('');
    setPending(true);
    try {
      const user = await loginUser(email.trim(), password);
      await completeLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal.');
    } finally {
      setPending(false);
    }
  }

  async function handleGoogleProfileSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!googleCredential) {
      setError('Sesi verifikasi Google tidak ditemukan. Silakan mulai kembali dengan tombol Google.');
      setGoogleProfile({ displayName: '', companyCode: '', position: '', department: '', section: '' });
      return;
    }
    setPending(true);
    try {
      const result = await hseApi.submitGoogleProfile({
        credential: googleCredential,
        displayName: googleProfile.displayName.trim(),
        companyCode: googleProfile.companyCode.trim().toUpperCase(),
        position: googleProfile.position.trim(),
        department: googleProfile.department.trim(),
        section: googleProfile.section.trim(),
      });
      if (result.pending === true) {
        throw new Error('Server GAS masih memakai alur verifikasi admin. Perbarui endpoint /api/auth/google/onboard agar akun baru langsung ACTIVE dan mengembalikan sesi login.');
      }
      {
        const user = result.user || await hseApi.loginWithGoogle(googleCredential);
        setGoogleCredential('');
        setGoogleProfile({ displayName: '', companyCode: '', position: '', department: '', section: '' });
        await completeLogin(user);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pendaftaran profil gagal dikirim.');
    } finally {
      setPending(false);
    }
  }

  function handleGoogleRegistration(): void {
    setError('');
    setNotice('');
    if (!GOOGLE_CLIENT_ID) {
      setError('Google Sign-In belum aktif: administrator harus menetapkan VITE_GOOGLE_CLIENT_ID.');
      return;
    }
    if (!googleReady || !window.google?.accounts?.id) {
      setError('Google Sign-In sedang dimuat. Coba lagi sebentar.');
      return;
    }
    registrationIntentRef.current = true;
    setRegistrationIntent(true);
    setNotice('Untuk melanjutkan pendaftaran, klik tombol Masuk dengan Google di bawah ini.');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#090909] px-4 py-8 text-neutral-100">
      <div className="my-auto w-full max-w-md rounded-3xl border border-white/10 bg-[#121212]/90 p-7 shadow-[0_0_30px_rgba(0,230,118,0.12)] backdrop-blur-md sm:p-8">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white p-2 shadow-[0_0_30px_rgba(0,230,118,0.18)]">
            <img src={cggLogo} alt="Logo CGG" className="h-full w-full object-contain" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#00E676]">CGG HDOS</p>
          <h1 className="mt-3 text-2xl font-bold">Masuk ke HDOS</h1>
          <p className="mt-2 text-sm text-neutral-400">Gunakan akun perusahaan atau akun Google yang terverifikasi.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block"><span className="mb-2 block text-xs uppercase tracking-[0.15em] text-neutral-400">Email</span><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-[#00E676] focus:ring-2 focus:ring-[#00E676]/30" placeholder="nama@perusahaan.com" autoComplete="email"/></label>
          <label className="block"><span className="mb-2 block text-xs uppercase tracking-[0.15em] text-neutral-400">Password</span><input required  type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-[#00E676] focus:ring-2 focus:ring-[#00E676]/30" placeholder="Masukkan password" autoComplete="current-password"/></label>
          {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
          {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</div>}
          <button type="submit" disabled={pending} className="w-full rounded-2xl bg-[#00E676] px-4 py-3 font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70">{pending?'Memproses...':'Masuk ke HDOS'}</button>
        </form>

        {googleCredential && (
          <form onSubmit={handleGoogleProfileSubmit} className="mt-5 space-y-3 rounded-2xl border border-[#00E676]/20 bg-[#00E676]/5 p-4">
            <div><h2 className="font-semibold text-white">Lengkapi Profil Pengguna</h2><p className="mt-1 text-xs leading-relaxed text-neutral-400">Pilih perusahaan. Akun CGG dapat menggunakan fitur internal sesuai hak yang ditetapkan; akun kontraktor hanya melihat data dan tidak mendapat hak unduh. Jabatan yang diketik tidak otomatis memberi hak Admin.</p></div>
            <label className="block text-xs text-neutral-300">Nama Lengkap<input required minLength={2} autoComplete="name" className="mt-1 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#00E676]" placeholder="Nama lengkap sesuai identitas" value={googleProfile.displayName} onChange={e=>setGoogleProfile({...googleProfile,displayName:e.target.value})}/></label>
            <label className="block text-xs text-neutral-300">Perusahaan<select required className="mt-1 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#00E676]" value={googleProfile.companyCode} onChange={e=>setGoogleProfile({...googleProfile,companyCode:e.target.value})}><option value="">Pilih perusahaan terdaftar</option>{registrationCompanies.map(company=><option key={company.code} value={company.code}>{company.name} ({company.code}){company.role === 'CGG' ? ' · Internal CGG' : ` · ${company.role === 'Subkon' ? 'Subkon' : 'Kontraktor'}${company.parentCompanyCode ? ` · Induk: ${company.parentCompanyCode}` : ''}`}</option>)}</select>{companies.length===0 && <span className="mt-1 block text-xs text-amber-300">Master kontraktor belum tersedia dari server. Pilihan CGG tetap ditampilkan; pendaftaran kontraktor memerlukan master perusahaan aktif di GAS.</span>}</label>
            <label className="block text-xs text-neutral-300">Jabatan<select required className="mt-1 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#00E676]" value={googleProfile.position} onChange={e=>setGoogleProfile({...googleProfile,position:e.target.value})}><option value="">Pilih jabatan</option><option value="KTT">KTT</option><option value="Project Manager">Project Manager</option><option value="Superintendent">Superintendent</option><option value="Supervisor">Supervisor</option><option value="Foreman">Foreman</option></select></label>
            <label className="block text-xs text-neutral-300">Departemen<input required list="hdos-department-options" className="mt-1 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#00E676]" placeholder="Pilih atau tulis departemen" value={googleProfile.department} onChange={e=>setGoogleProfile({...googleProfile,department:e.target.value})}/><datalist id="hdos-department-options"><option value="HSE"/><option value="Produksi"/><option value="Plant"/><option value="Engineering"/><option value="Geology"/><option value="Hauling"/><option value="Warehouse"/><option value="HRGA"/><option value="Finance"/><option value="Lainnya"/></datalist></label>
            <label className="block text-xs text-neutral-300">Bagian / Section<input required list="hdos-section-options" className="mt-1 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#00E676]" placeholder="Pilih atau tulis bagian" value={googleProfile.section} onChange={e=>setGoogleProfile({...googleProfile,section:e.target.value})}/><datalist id="hdos-section-options"><option value="Safety"/><option value="Occupational Health"/><option value="Environment"/><option value="Pit Operation"/><option value="Hauling"/><option value="Workshop"/><option value="Camp"/><option value="Jetty"/><option value="Lainnya"/></datalist></label>
            <button type="submit" disabled={pending} className="w-full rounded-xl bg-[#00E676] px-4 py-3 font-semibold text-black disabled:opacity-60">{pending?'Membuat akun...':'Buat Akun & Masuk'}</button>
          </form>
        )}

        <button type="button" disabled={pending} onClick={handleGoogleRegistration} className="mt-4 w-full rounded-2xl border border-[#00E676]/50 bg-[#00E676]/10 px-4 py-3 text-sm font-semibold text-[#00E676] transition hover:bg-[#00E676]/15 disabled:opacity-60">Daftar Akun Baru</button>
        <p className="mt-2 text-center text-xs text-neutral-500">Pengguna baru memverifikasi Google, melengkapi profil, lalu langsung masuk jika GAS sudah mendukung aktivasi otomatis.</p>

        <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-neutral-600"><div className="h-px flex-1 bg-white/10"/><span>atau</span><div className="h-px flex-1 bg-white/10"/></div>
        <div id="google-signin-button" className="mt-4 flex min-h-12 w-full justify-center" aria-label="Masuk dengan Google" />
        {!GOOGLE_CLIENT_ID && <p className="mt-3 text-center text-xs text-neutral-500">Google Sign-In menunggu konfigurasi OAuth administrator.</p>}
      </div>
    </div>
  );
}
