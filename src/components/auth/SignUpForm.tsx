import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, User, UserPlus } from 'lucide-react';

export function SignUpForm({ onToggle }: { onToggle: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { signUp, signInWithGoogle } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır');
      setLoading(false);
      return;
    }

    const { error: signUpError } = await signUp(email, password, username);
    if (signUpError) {
      setError(signUpError.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError('');
    const { error: googleError } = await signInWithGoogle();
    if (googleError) {
      setError(googleError.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-700 rounded-lg p-8 shadow-card">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Ovox</h1>
          <p className="text-neutral-600">Hesap oluştur</p>
        </div>

        {error && (
          <div className="bg-error/10 border border-error rounded p-3 mb-4">
            <p className="text-error text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-success/10 border border-success rounded p-3 mb-4">
            <p className="text-success text-sm">Hesap oluşturuldu! Giriş yapabilirsiniz.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              Kullanıcı Adı
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-800 border border-transparent rounded pl-10 pr-4 py-3 text-white focus:border-primary-500 focus:shadow-glow-sm focus:outline-none transition-all duration-fast"
                placeholder="kullaniciadi"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              E-posta
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-800 border border-transparent rounded pl-10 pr-4 py-3 text-white focus:border-primary-500 focus:shadow-glow-sm focus:outline-none transition-all duration-fast"
                placeholder="ornek@email.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              Şifre
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-800 border border-transparent rounded pl-10 pr-4 py-3 text-white focus:border-primary-500 focus:shadow-glow-sm focus:outline-none transition-all duration-fast"
                placeholder="••••••••"
                required
              />
            </div>
            <p className="text-xs text-neutral-400 mt-1">En az 6 karakter</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-500 text-white rounded py-3 font-medium hover:bg-primary-700 hover:shadow-glow transition-all duration-normal disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Hesap oluşturuluyor...</span>
            ) : (
              <>
                <UserPlus className="w-5 h-5" />
                Kayıt Ol
              </>
            )}
          </button>
        </form>

        <div className="mt-4 flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-800"></div>
          <span className="text-xs text-neutral-500 uppercase tracking-wider">veya</span>
          <div className="flex-1 h-px bg-gray-800"></div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full mt-4 bg-white text-gray-900 rounded py-3 font-medium hover:bg-gray-100 transition-all duration-normal disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Google ile Kayıt Ol
        </button>

        <div className="mt-6 text-center">
          <p className="text-neutral-600 text-sm">
            Zaten hesabın var mı?{' '}
            <button
              onClick={onToggle}
              className="text-primary-500 hover:text-primary-700 font-medium transition-colors"
            >
              Giriş Yap
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
