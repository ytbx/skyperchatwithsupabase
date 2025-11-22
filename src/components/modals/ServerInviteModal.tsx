import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ServerInvite } from '@/lib/types';
import { X, Copy, Link as LinkIcon, Plus, Trash2, Check } from 'lucide-react';

interface ServerInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  serverName: string;
}

export function ServerInviteModal({ isOpen, onClose, serverId, serverName }: ServerInviteModalProps) {
  const { user } = useAuth();
  const [invites, setInvites] = useState<ServerInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && serverId) {
      loadInvites();
    }
  }, [isOpen, serverId]);

  async function loadInvites() {
    const { data, error } = await supabase
      .from('server_invites')
      .select('*')
      .eq('server_id', serverId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (data && !error) {
      setInvites(data);
    }
  }

  async function createInvite(expiresInDays?: number, maxUses?: number) {
    if (!user) return;

    setLoading(true);
    
    const inviteCode = generateInviteCode();
    const expiresAt = expiresInDays 
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data, error } = await supabase
      .from('server_invites')
      .insert({
        server_id: serverId,
        invite_code: inviteCode,
        created_by: user.id,
        expires_at: expiresAt,
        max_uses: maxUses || null,
        uses: 0,
        is_active: true
      })
      .select()
      .single();

    if (!error && data) {
      setInvites([data, ...invites]);
    }

    setLoading(false);
  }

  async function deleteInvite(inviteId: number) {
    const { error } = await supabase
      .from('server_invites')
      .delete()
      .eq('id', inviteId);

    if (!error) {
      setInvites(invites.filter(inv => inv.id !== inviteId));
    }
  }

  function generateInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async function copyInviteLink(inviteCode: string) {
    const inviteLink = `${window.location.origin}/invite/${inviteCode}`;
    await navigator.clipboard.writeText(inviteLink);
    setCopiedCode(inviteCode);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Sunucu Davetleri</h2>
            <p className="text-sm text-gray-400 mt-1">{serverName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Quick Create Buttons */}
        <div className="p-6 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">
            Hızlı Davet Oluştur
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => createInvite()}
              disabled={loading}
              className="p-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Sınırsız Davet
            </button>
            <button
              onClick={() => createInvite(7, 10)}
              disabled={loading}
              className="p-4 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              7 Gün, 10 Kullanım
            </button>
          </div>
        </div>

        {/* Invites List */}
        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">
            Mevcut Davetler ({invites.length})
          </h3>
          <div className="space-y-3">
            {invites.length === 0 ? (
              <div className="text-center py-8 text-neutral-500">
                <LinkIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Henüz davet oluşturulmamış</p>
              </div>
            ) : (
              invites.map((invite) => {
                const isExpired = invite.expires_at && new Date(invite.expires_at) < new Date();
                const isMaxUsed = invite.max_uses && invite.uses >= invite.max_uses;

                return (
                  <div
                    key={invite.id}
                    className={`p-4 rounded-lg border ${
                      isExpired || isMaxUsed
                        ? 'bg-gray-950 border-gray-800 opacity-60'
                        : 'bg-gray-800 border-gray-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono text-blue-400 bg-gray-950 px-2 py-1 rounded">
                            {invite.invite_code}
                          </code>
                          {(isExpired || isMaxUsed) && (
                            <span className="text-xs text-red-400 font-semibold">
                              {isExpired ? 'Süresi Dolmuş' : 'Kullanım Limiti Doldu'}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-400 space-y-1">
                          <div>
                            Kullanım: {invite.uses} / {invite.max_uses || '∞'}
                          </div>
                          {invite.expires_at && (
                            <div>
                              Bitiş: {new Date(invite.expires_at).toLocaleString('tr-TR')}
                            </div>
                          )}
                          <div className="text-xs text-neutral-500">
                            Oluşturuldu: {new Date(invite.created_at).toLocaleString('tr-TR')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyInviteLink(invite.invite_code)}
                          className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                          title="Davet Linkini Kopyala"
                        >
                          {copiedCode === invite.invite_code ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => deleteInvite(invite.id)}
                          className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                          title="Daveti Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800">
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
