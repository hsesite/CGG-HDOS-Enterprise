import { useEffect, useState } from 'react';
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
          prompt: (callback?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
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
  const [googleProfile, setGoogleProfile] = useState({ displayName: '', companyCode: '', position: '', department: '', section: '' });
  const [companies, setCompanies] = useState<Array<{ code: string; name: string; role: string; parentCompanyCode?: string }>>([]);

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
      if (!result.pending) {
        const user = await hseApi.loginWithGoogle(googleCredential);
        setGoogleCredential('');
        setGoogleProfile({ displayName: '', companyCode: '', position: '', department: '', section: '' });
        await completeLogin(user);
        return;
      }
      setNotice(result.message || 'Pendaftaran profil berhasil diproses.');
      setRegistrationIntent(false);
      setGoogleCredential('');
      setGoogleProfile({ displayName: '', companyCode: '', position: '', department: '', section: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pendaftaran profil gagal dikirim.');
    } finally {
      setPending(false);
    }
  }

  function handleGoogleLogin(forRegistration = false): void {
    setError('');
    setNotice('');
    if (!GOOGLE_CLIENT_ID) {
      setError('Google Sign-In belum aktif: administrator harus menetapkan VITE_GOOGLE_CLIENT_ID dan memasang endpoint verifikasi Google pada Google Apps Script.');
      return;
    }
    const googleId = window.google?.accounts?.id;
    if (!googleReady || !googleId) {
      setError('Google Sign-In sedang dimuat. Coba lagi sebentar.');
      return;
    }
    googleId.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async ({ credential }) => {
        setPending(true);
        try {
          if (forRegistration) {
            setGoogleCredential(credential);
            setGoogleProfile((profile) => ({ ...profile, displayName: profile.displayName || '' }));
            setNotice('Verifikasi Google berhasil. Lengkapi profil untuk mendaftar sebagai akun umum HDOS dengan akses terbatas.');
            setRegistrationIntent(false);
            return;
          }
          const user = await hseApi.loginWithGoogle(credential);
          await completeLogin(user);
        } catch (err) {
          if (err instanceof ApiError && err.status === 403 && err.message.toLowerCase().includes('belum didaftarkan')) {
            setGoogleCredential(credential);
            setGoogleProfile((profile) => ({ ...profile, displayName: profile.displayName || '' }));
            setNotice('Akun Google terverifikasi. Lengkapi profil untuk membuat akun umum HDOS dengan akses terbatas.');
          } else {
            setError(err instanceof Error ? err.message : 'Login Google gagal.');
          }
        } finally {
          setPending(false);
        }
      },
      auto_select: false,
    });
    googleId.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        setError('Pilihan akun Google tidak ditampilkan. Periksa konfigurasi OAuth dan domain aplikasi.');
      }
    });
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
            <div><h2 className="font-semibold text-white">Lengkapi Profil Pengguna</h2><p className="mt-1 text-xs leading-relaxed text-neutral-400">Pilih perusahaan yang sudah terdaftar. Akun umum akan langsung aktif dengan akses terbatas; jabatan yang Anda isi tidak otomatis memberi hak Admin atau hak kontrol.</p></div>
            <label className="block text-xs text-neutral-300">Nama Lengkap<input required minLength={2} autoComplete="name" className="mt-1 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#00E676]" placeholder="Nama lengkap sesuai identitas" value={googleProfile.displayName} onChange={e=>setGoogleProfile({...googleProfile,displayName:e.target.value})}/></label>
            <label className="block text-xs text-neutral-300">Perusahaan<select required className="mt-1 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#00E676]" value={googleProfile.companyCode} onChange={e=>setGoogleProfile({...googleProfile,companyCode:e.target.value})}><option value="">Pilih perusahaan terdaftar</option>{companies.map(company=><option key={company.code} value={company.code}>{company.name} ({company.code}) · {company.role === 'Subkon' ? 'Subkon' : 'Kontraktor'}{company.parentCompanyCode ? ` · Induk: ${company.parentCompanyCode}` : ''}</option>)}</select>{companies.length===0 && <span className="mt-1 block text-xs text-amber-300">Daftar perusahaan belum tersedia dari server. Admin perlu menyiapkan master perusahaan di GAS.</span>}</label>
            <label className="block text-xs text-neutral-300">Jabatan<input required list="hdos-position-options" className="mt-1 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#00E676]" placeholder="Pilih atau tulis jabatan" value={googleProfile.position} onChange={e=>setGoogleProfile({...googleProfile,position:e.target.value})}/><datalist id="hdos-position-options"><option value="KTT"/><option value="Kepala Teknik Tambang"/><option value="Project Manager"/><option value="SPV HSE"/><option value="Foreman Safety"/><option value="Safety Officer"/><option value="Supervisor"/><option value="Operator"/><option value="Admin"/><option value="Lainnya"/></datalist></label>
            <label className="block text-xs text-neutral-300">Departemen<input required list="hdos-department-options" className="mt-1 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#00E676]" placeholder="Pilih atau tulis departemen" value={googleProfile.department} onChange={e=>setGoogleProfile({...googleProfile,department:e.target.value})}/><datalist id="hdos-department-options"><option value="HSE"/><option value="Produksi"/><option value="Plant"/><option value="Engineering"/><option value="Geology"/><option value="Hauling"/><option value="Warehouse"/><option value="HRGA"/><option value="Finance"/><option value="Lainnya"/></datalist></label>
            <label className="block text-xs text-neutral-300">Bagian / Section<input required list="hdos-section-options" className="mt-1 w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#00E676]" placeholder="Pilih atau tulis bagian" value={googleProfile.section} onChange={e=>setGoogleProfile({...googleProfile,section:e.target.value})}/><datalist id="hdos-section-options"><option value="Safety"/><option value="Occupational Health"/><option value="Environment"/><option value="Pit Operation"/><option value="Hauling"/><option value="Workshop"/><option value="Camp"/><option value="Jetty"/><option value="Lainnya"/></datalist></label>
            <button type="submit" disabled={pending} className="w-full rounded-xl bg-[#00E676] px-4 py-3 font-semibold text-black disabled:opacity-60">{pending?'Mengirim profil...':'Kirim Profil untuk Verifikasi'}</button>
          </form>
        )}

        <button type="button" disabled={pending} onClick={() => handleGoogleLogin(true)} className="mt-4 w-full rounded-2xl border border-[#00E676]/50 bg-[#00E676]/10 px-4 py-3 text-sm font-semibold text-[#00E676] transition hover:bg-[#00E676]/15 disabled:opacity-60">Daftar Akun Baru</button>
        <p className="mt-2 text-center text-xs text-neutral-500">Pengguna baru mendaftar melalui verifikasi Google dan memilih perusahaan terdaftar.</p>

        <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-neutral-600"><div className="h-px flex-1 bg-white/10"/><span>atau</span><div className="h-px flex-1 bg-white/10"/></div>
        <button type="button" disabled={pending} onClick={() => handleGoogleLogin(false)} className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-200 disabled:opacity-60"><svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 3.05 13.22l7.98 6.19C12.92 13.72 18.01 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.94 46.98 31.7 46.98 24.55z"/><path fill="#FBBC05" d="M10.03 28.59A14.4 14.4 0 0 1 9.25 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.58 10.78l7.45-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-5.99 0-11.08-4.22-12.97-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Masuk dengan Google</button>
        {!GOOGLE_CLIENT_ID && <p className="mt-3 text-center text-xs text-neutral-500">Google Sign-In menunggu konfigurasi OAuth administrator.</p>}
      </div>
    </div>
  );
}
