import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, LogIn } from 'lucide-react';

export function LoginForm({ onToggle }: { onToggle: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError.message);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-700 rounded-lg p-8 shadow-card">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Ovox</h1>
          <p className="text-neutral-600">Tekrar hoş geldin!</p>
        </div>

        {error && (
          <div className="bg-error/10 border border-error rounded p-3 mb-4">
            <p className="text-error text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-500 text-white rounded py-3 font-medium hover:bg-primary-700 hover:shadow-glow transition-all duration-normal disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Giriş yapılıyor...</span>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                Giriş Yap
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-neutral-600 text-sm">
            Hesabın yok mu?{' '}
            <button
              onClick={onToggle}
              className="text-primary-500 hover:text-primary-700 font-medium transition-colors"
            >
              Kayıt Ol
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
