import { useState } from 'react';
import { loginUser } from '../../core/auth-utils';
import { AuthState } from '../../core/auth-state';
import { Button, Input, Card } from '../ui';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }): JSX.Element {
  const [email, setEmail] = useState('admin@ptcgg.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const user = await loginUser(email.trim(), password);
      AuthState.saveUser(user);
      onLoggedIn();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login gagal. Periksa email dan password.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[#090909] via-[#0a0a0a] to-[#000000] overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-[#00E676]/5 blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full bg-[#42A5F5]/5 blur-[120px] animate-pulse" />
      </div>

      {/* Login Card Container */}
      <div className="relative w-full max-w-md mx-4">
        <Card variant="elevated" className="p-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#00E676]/5 via-transparent to-[#42A5F5]/5 pointer-events-none" />
          
          {/* Main Content */}
          <div className="relative p-8 sm:p-10 space-y-8">
            {/* Header Section */}
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-[#00E676]/20 rounded-3xl blur-2xl" />
                  <div className="relative h-16 w-16 rounded-3xl bg-gradient-to-br from-[#00E676] to-[#00C853] text-black font-black text-3xl flex items-center justify-center shadow-[0_0_40px_rgba(0,230,118,0.6)]">
                    C
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.4em] text-[#00E676] drop-shadow-[0_0_10px_rgba(0,230,118,0.3)]">
                  CGG HDOS
                </p>
                <h1 className="text-3xl font-black text-white tracking-tight">
                  Enterprise Access
                </h1>
                <p className="text-sm text-neutral-400">
                  Dashboard operasional HSE terpadu untuk pertambangan modern
                </p>
              </div>
            </div>

            {/* Form Section */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Input */}
              <div className="space-y-2">
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@ptcgg.com"
                  disabled={isLoading}
                  required
                  autoComplete="email"
                />
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <label className="block text-xs uppercase tracking-widest text-neutral-400 font-semibold">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    disabled={isLoading}
                    required
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-white/10 bg-neutral-950 px-4 py-2.5 pr-12 text-sm text-white outline-none transition focus:border-[#00E676] focus:ring-2 focus:ring-[#00E676]/30 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-3">
                  <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isLoading}
                disabled={isLoading || !email || !password}
                className="w-full mt-2"
              >
                {isLoading ? 'Memverifikasi Akses...' : 'Masuk ke HDOS'}
              </Button>

              {/* Divider */}
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-neutral-900/50 px-2 text-neutral-500 font-medium">atau</span>
                </div>
              </div>

              {/* Demo Account Info */}
              <Card variant="outlined" className="p-4 space-y-2 bg-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-neutral-300">Demo Credentials</span>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-[#00E676]/20 text-[#00E676] font-semibold">
                    Ready to Use
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-neutral-300 font-mono">
                  <div>
                    <span className="text-neutral-500">Email: </span>
                    <span className="text-white font-semibold">admin@ptcgg.com</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Password: </span>
                    <span className="text-white font-semibold">GantiDenganPassword123!</span>
                  </div>
                </div>
              </Card>
            </form>

            {/* Footer Info */}
            <div className="pt-4 border-t border-white/10 space-y-3 text-center">
              <p className="text-[11px] text-neutral-400">
                Powered by <span className="font-semibold text-[#00E676]">CGG HSE Enterprise</span>
              </p>
              <div className="flex items-center justify-center gap-2 text-[10px] text-neutral-500">
                <span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
                <span>Connected to Google Sheets Backend</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Bottom Security Badge */}
        <div className="mt-4 text-center">
          <p className="text-[10px] text-neutral-600 flex items-center justify-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500/50" />
            Secure Connection · Enterprise Grade
          </p>
        </div>
      </div>

      {/* Mobile-only background gradient overlay */}
      <div className="fixed inset-0 pointer-events-none sm:hidden bg-gradient-to-t from-[#090909] via-transparent to-transparent" />
    </div>
  );
}
