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
  const { signUp } = useAuth();

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

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-700 rounded-lg p-8 shadow-card">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">SkyperChat</h1>
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
