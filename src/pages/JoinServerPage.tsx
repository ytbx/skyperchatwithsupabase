import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Server, Check, AlertCircle } from 'lucide-react';

export function JoinServerPage() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverInfo, setServerInfo] = useState<any>(null);
  const [inviteInfo, setInviteInfo] = useState<any>(null);
  const [alreadyMember, setAlreadyMember] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    if (inviteCode) {
      loadInviteInfo();
    }
  }, [inviteCode, user]);

  async function loadInviteInfo() {
    setLoading(true);
    setError(null);

    // Load invite
    const { data: invite, error: inviteError } = await supabase
      .from('server_invites')
      .select('*')
      .eq('invite_code', inviteCode)
      .eq('is_active', true)
      .maybeSingle();

    if (inviteError || !invite) {
      console.error('Invite load error:', inviteError);
      setError(inviteError?.message || 'Geçersiz veya süresi dolmuş davet kodu');
      setLoading(false);
      return;
    }

    // Check if expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      setError('Bu davet kodunun süresi dolmuş');
      setLoading(false);
      return;
    }

    // Check if max uses reached
    if (invite.max_uses && invite.uses >= invite.max_uses) {
      setError('Bu davet kodu kullanım limitine ulaşmış');
      setLoading(false);
      return;
    }

    setInviteInfo(invite);

    // Load server info
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('*')
      .eq('id', invite.server_id)
      .maybeSingle();

    if (serverError || !server) {
      setError('Sunucu bilgisi yüklenemedi');
      setLoading(false);
      return;
    }

    setServerInfo(server);

    // Check if already a member
    if (user) {
      const { data: membership } = await supabase
        .from('server_users')
        .select('user_id')
        .eq('server_id', server.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (membership) {
        setAlreadyMember(true);
      }
    }

    setLoading(false);
  }

  async function joinServer() {
    if (!user || !serverInfo || !inviteInfo) return;

    setJoining(true);
    setError(null);

    // Add user to server
    const { error: joinError } = await supabase
      .from('server_users')
      .insert({
        server_id: serverInfo.id,
        user_id: user.id
      });

    if (joinError) {
      if (joinError.code === '23505') {
        // Already a member
        setAlreadyMember(true);
      } else {
        setError('Sunucuya katılırken hata oluştu');
        setJoining(false);
        return;
      }
    }

    // Increment invite uses
    await supabase
      .from('server_invites')
      .update({ uses: inviteInfo.uses + 1 })
      .eq('id', inviteInfo.id);

    setJoining(false);

    // Redirect to app
    setTimeout(() => {
      navigate('/');
    }, 2000);
  }

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white">Davet bilgisi yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-neutral-900 rounded-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Hata</h2>
          <p className="text-neutral-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors"
          >
            Ana Sayfaya Dön
          </button>
        </div>
      </div>
    );
  }

  if (alreadyMember) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-neutral-900 rounded-lg p-8 max-w-md w-full text-center">
          <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Zaten Üyesiniz</h2>
          <p className="text-neutral-400 mb-2">
            <strong className="text-white">{serverInfo?.name}</strong> sunucusunun zaten bir üyesisiniz
          </p>
          <p className="text-neutral-500 mb-6">Ana sayfaya yönlendiriliyorsunuz...</p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Hemen Git
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-neutral-900 rounded-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          {serverInfo?.server_image_url ? (
            <img
              src={serverInfo.server_image_url}
              alt={serverInfo.name}
              className="w-24 h-24 rounded-full mx-auto mb-4 object-cover"
            />
          ) : (
            <div className="w-24 h-24 bg-blue-600 rounded-full mx-auto mb-4 flex items-center justify-center">
              <Server className="w-12 h-12 text-white" />
            </div>
          )}
          <h2 className="text-2xl font-bold text-white mb-2">Sunucuya Katıl</h2>
          <p className="text-xl text-white font-semibold mb-1">{serverInfo?.name}</p>
          <p className="text-sm text-neutral-400">
            {inviteCode} davet kodu ile davet edildiniz
          </p>
        </div>

        <div className="bg-neutral-800 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center text-sm">
            <span className="text-neutral-400">Kullanımlar:</span>
            <span className="text-white">
              {inviteInfo?.uses} / {inviteInfo?.max_uses || '∞'}
            </span>
          </div>
          {inviteInfo?.expires_at && (
            <div className="flex justify-between items-center text-sm mt-2">
              <span className="text-neutral-400">Son Kullanma:</span>
              <span className="text-white">
                {new Date(inviteInfo.expires_at).toLocaleDateString('tr-TR')}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={joinServer}
          disabled={joining}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors mb-3"
        >
          {joining ? 'Katılınıyor...' : 'Sunucuya Katıl'}
        </button>

        <button
          onClick={() => navigate('/')}
          className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors"
        >
          İptal
        </button>
      </div>
    </div>
  );
}
