import { useState } from 'react';
import { X, Plus, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServerCreated: () => void;
}

export function CreateServerModal({ isOpen, onClose, onServerCreated }: CreateServerModalProps) {
  const [view, setView] = useState<'choose' | 'create' | 'join'>('choose');
  const [serverName, setServerName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleClose = () => {
    setView('choose');
    setServerName('');
    setInviteCode('');
    onClose();
  };

  async function handleCreateServer(e: React.FormEvent) {
    e.preventDefault();
    if (!serverName.trim() || !user || loading) return;

    setLoading(true);

    try {
      // Create server
      const { data: server, error: serverError } = await supabase
        .from('servers')
        .insert({
          name: serverName.trim(),
          owner_id: user.id,
          is_public: false,
        })
        .select()
        .single();

      if (serverError) throw serverError;

      // Add owner to server_users
      const { error: userError } = await supabase
        .from('server_users')
        .insert({
          user_id: user.id,
          server_id: server.id,
        });

      if (userError) throw userError;

      // Create default text channel
      const { error: channelError } = await supabase
        .from('channels')
        .insert({
          name: 'genel',
          server_id: server.id,
          is_voice: false,
        });

      if (channelError) throw channelError;

      setServerName('');
      onServerCreated();
      handleClose();
    } catch (error) {
      console.error('Error creating server:', error);
      alert('Sunucu oluşturulurken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinServer(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim() || !user || loading) return;

    setLoading(true);

    try {
      const trimmedCode = inviteCode.trim();

      // Get invite
      const { data: invite, error: inviteError } = await supabase
        .from('server_invites')
        .select('*, server:servers(*)')
        .eq('invite_code', trimmedCode)
        .maybeSingle();

      if (inviteError) {
        console.error('Invite query error:', inviteError);
        alert('Davet kodu aranırken hata oluştu. Lütfen tekrar deneyin.');
        setLoading(false);
        return;
      }

      if (!invite) {
        alert('Geçersiz davet kodu. Lütfen kodu kontrol edin.');
        setLoading(false);
        return;
      }

      // Check if invite expired
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        alert('Bu davet kodunun süresi dolmuş. Yeni bir davet kodu isteyin.');
        setLoading(false);
        return;
      }

      // Check if already a member
      const { data: existingMember, error: memberError } = await supabase
        .from('server_users')
        .select('*')
        .eq('server_id', invite.server_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberError) {
        console.error('Member check error:', memberError);
      }

      if (existingMember) {
        alert('Bu sunucuya zaten üyesiniz.');
        setLoading(false);
        return;
      }

      // Add user to server
      const { error: joinError } = await supabase
        .from('server_users')
        .insert({
          user_id: user.id,
          server_id: invite.server_id,
        });

      if (joinError) {
        console.error('Join error:', joinError);
        throw new Error('Sunucuya katılırken hata oluştu: ' + joinError.message);
      }

      // Increment uses
      await supabase
        .from('server_invites')
        .update({ uses: (invite.uses || 0) + 1 })
        .eq('id', invite.id);

      setInviteCode('');
      onServerCreated();
      handleClose();
      alert(`${invite.server.name} sunucusuna başarıyla katıldınız!`);
    } catch (error) {
      console.error('Error joining server:', error);
      const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata';
      alert('Sunucuya katılırken bir hata oluştu: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-gray-700 rounded-lg w-full max-w-md shadow-glow-lg animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-2xl font-semibold text-white">
            {view === 'choose' && 'Sunucu Ekle'}
            {view === 'create' && 'Sunucu Oluştur'}
            {view === 'join' && 'Sunucuya Katıl'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-600 rounded transition-colors"
          >
            <X className="w-5 h-5 text-neutral-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Choose View */}
          {view === 'choose' && (
            <div className="space-y-3">
              <button
                onClick={() => setView('create')}
                className="w-full p-4 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-all hover:shadow-glow flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <Plus className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-lg">Sunucu Yarat</h3>
                    <p className="text-sm text-white/80">Kendi sunucunu oluştur</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => setView('join')}
                className="w-full p-4 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
                    <ArrowRight className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-lg">Sunucuya Katıl</h3>
                    <p className="text-sm text-white/70">Davet kodu ile katıl</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}

          {/* Create View */}
          {view === 'create' && (
            <form onSubmit={handleCreateServer} className="space-y-4">
              <div className="text-center mb-6">
                <p className="text-neutral-600 text-sm">
                  Sunucuna bir isim ver ve arkadaşlarını davet et
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  Sunucu Adı
                </label>
                <input
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  className="w-full bg-gray-800 border border-transparent rounded px-4 py-3 text-white focus:border-primary-500 focus:shadow-glow-sm focus:outline-none transition-all"
                  placeholder="Benim Muhteşem Sunucum"
                  required
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setView('choose')}
                  className="flex-1 px-4 py-2.5 rounded bg-gray-600 text-gray-200 font-medium hover:bg-gray-300 transition-colors"
                >
                  Geri
                </button>
                <button
                  type="submit"
                  disabled={!serverName.trim() || loading}
                  className="flex-1 px-4 py-2.5 rounded bg-primary-500 text-white font-medium hover:bg-primary-700 hover:shadow-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? 'Oluşturuluyor...' : 'Oluştur'}
                </button>
              </div>
            </form>
          )}

          {/* Join View */}
          {view === 'join' && (
            <form onSubmit={handleJoinServer} className="space-y-4">
              <div className="text-center mb-6">
                <p className="text-neutral-600 text-sm">
                  Bir sunucuya katılmak için davet kodunu gir
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  Davet Kodu
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="w-full bg-gray-800 border border-transparent rounded px-4 py-3 text-white focus:border-primary-500 focus:shadow-glow-sm focus:outline-none transition-all"
                  placeholder="ABC123DEF"
                  required
                  autoFocus
                />
                <p className="text-xs text-neutral-500 mt-2">
                  Davet kodları genellikle şöyle görünür: ABC123DEF
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setView('choose')}
                  className="flex-1 px-4 py-2.5 rounded bg-gray-600 text-gray-200 font-medium hover:bg-gray-300 transition-colors"
                >
                  Geri
                </button>
                <button
                  type="submit"
                  disabled={!inviteCode.trim() || loading}
                  className="flex-1 px-4 py-2.5 rounded bg-primary-500 text-white font-medium hover:bg-primary-700 hover:shadow-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? 'Katılınıyor...' : 'Katıl'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
