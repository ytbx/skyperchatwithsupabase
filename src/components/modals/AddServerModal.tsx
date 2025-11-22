import { useState } from 'react';
import { X, Plus, UserPlus, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServerCreated?: () => void;
}

export function AddServerModal({ isOpen, onClose, onServerCreated }: AddServerModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'choice' | 'create' | 'join'>('choice');
  const [serverName, setServerName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetAndClose = () => {
    setMode('choice');
    setServerName('');
    setInviteCode('');
    setError(null);
    onClose();
  };

  const handleCreateServer = async () => {
    if (!serverName.trim() || !user) return;

    setLoading(true);
    setError(null);

    try {
      // Create server
      const { data: server, error: serverError } = await supabase
        .from('servers')
        .insert({
          name: serverName.trim(),
          owner_id: user.id,
          is_public: false
        })
        .select()
        .single();

      if (serverError) throw serverError;

      // Add owner as member
      const { error: memberError } = await supabase
        .from('server_users')
        .insert({
          server_id: server.id,
          user_id: user.id
        });

      if (memberError) throw memberError;

      // Create default channel
      const { error: channelError } = await supabase
        .from('channels')
        .insert({
          server_id: server.id,
          name: 'genel',
          is_voice: false,
          is_owner_only: false
        });

      if (channelError) throw channelError;

      if (onServerCreated) {
        onServerCreated();
      }
      resetAndClose();
    } catch (err: any) {
      setError(err.message || 'Sunucu oluşturulamadı');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinServer = async () => {
    if (!inviteCode.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Navigate to invite page
      navigate(`/invite/${inviteCode.trim()}`);
      resetAndClose();
    } catch (err: any) {
      setError('Geçersiz davet kodu');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 rounded-lg w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">
            {mode === 'choice' && 'Sunucu Ekle'}
            {mode === 'create' && 'Sunucu Oluştur'}
            {mode === 'join' && 'Sunucuya Katıl'}
          </h2>
          <button
            onClick={resetAndClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {mode === 'choice' && (
            <div className="space-y-3">
              <button
                onClick={() => setMode('create')}
                className="w-full p-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-4 group"
              >
                <div className="p-3 bg-white/10 rounded-full group-hover:bg-white/20 transition-colors">
                  <Plus className="w-8 h-8" />
                </div>
                <div className="text-left">
                  <div className="text-lg font-semibold">Sunucu Oluştur</div>
                  <div className="text-sm text-blue-100">Kendi sunucunu oluştur ve yönet</div>
                </div>
              </button>

              <button
                onClick={() => setMode('join')}
                className="w-full p-6 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors flex items-center gap-4 group"
              >
                <div className="p-3 bg-white/5 rounded-full group-hover:bg-white/10 transition-colors">
                  <UserPlus className="w-8 h-8" />
                </div>
                <div className="text-left">
                  <div className="text-lg font-semibold">Sunucuya Katıl</div>
                  <div className="text-sm text-gray-400">Davet kodu ile bir sunucuya katıl</div>
                </div>
              </button>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sunucu Adı
                </label>
                <input
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="Harika Sunucu"
                  className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setMode('choice')}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Geri
                </button>
                <button
                  onClick={handleCreateServer}
                  disabled={!serverName.trim() || loading}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Oluşturuluyor...
                    </>
                  ) : (
                    'Oluştur'
                  )}
                </button>
              </div>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Davet Kodu
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Davet kodu..."
                  className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none font-mono normal-case"
                  style={{ textTransform: 'none' }}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                />
                <p className="text-xs text-neutral-500 mt-2">
                  Davet linkinden aldığın kodu buraya yapıştır
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setMode('choice')}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Geri
                </button>
                <button
                  onClick={handleJoinServer}
                  disabled={!inviteCode.trim() || loading}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Katılınıyor...
                    </>
                  ) : (
                    'Katıl'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
