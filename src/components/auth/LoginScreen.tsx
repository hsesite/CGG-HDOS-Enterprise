import { useState } from 'react';
import { hseApi, ApiError } from '../../core/api';
import { hdosAuth } from '../../core/auth';
import type { UserRole } from '../../core/types';

const ROLE_PRIORITY: UserRole[] = ['KTT', 'Project Manager', 'SPV HSE', 'Foreman Safety', 'Safety Officer', 'Paramedis', 'Contractor PIC', 'Employee'];

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }): JSX.Element {
  const [email, setEmail] = useState('admin@ptcgg.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setPending(true);

    try {
      const user = await hseApi.login(email.trim(), password);
      const normalizedRole = user.roles.find((role) => ROLE_PRIORITY.includes(role as UserRole)) as UserRole | undefined;
      hdosAuth.setRole(normalizedRole ?? 'SPV HSE');
      onLoggedIn();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Login gagal. Periksa email dan password.';
      setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090909] text-neutral-100">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#121212]/90 p-8 shadow-[0_0_30px_rgba(0,230,118,0.12)] backdrop-blur-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00E676] text-2xl font-black text-black shadow-[0_0_30px_rgba(0,230,118,0.6)]">
            C
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#00E676]">CGG HDOS</p>
          <h1 className="mt-3 text-2xl font-bold">Enterprise Access</h1>
          <p className="mt-2 text-sm text-neutral-400">Masuk untuk membuka dashboard operasional HSE.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-neutral-400">Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm outline-none transition focus:border-[#00E676] focus:ring-2 focus:ring-[#00E676]/30"
              placeholder="admin@ptcgg.com"
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-neutral-400">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-neutral-950 px-4 py-3 text-sm outline-none transition focus:border-[#00E676] focus:ring-2 focus:ring-[#00E676]/30"
              placeholder="Masukkan password"
              autoComplete="current-password"
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-2xl bg-[#00E676] px-4 py-3 font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? 'Memeriksa akses...' : 'Masuk ke HDOS'}
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3 text-xs text-neutral-400">
          Default admin seed: <span className="font-mono text-neutral-200">admin@ptcgg.com</span>
        </div>
      </div>
    </div>
  );
}
