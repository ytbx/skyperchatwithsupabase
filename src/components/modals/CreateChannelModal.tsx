import { useState } from 'react';
import { X, Hash, Volume2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  onChannelCreated?: () => void;
}

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  isOpen,
  onClose,
  serverId,
  onChannelCreated
}) => {
  const { user } = useAuth();
  const [channelName, setChannelName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isVoice, setIsVoice] = useState(false);
  const [creating, setCreating] = useState(false);

  if (!isOpen) return null;

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim() || !user || creating) return;

    setCreating(true);

    try {
      // Create the channel
      const { error: channelError } = await supabase
        .from('channels')
        .insert({
          name: channelName.trim(),
          server_id: serverId,
          is_voice: isVoice,
          is_owner_only: isPrivate
        });

      if (channelError) throw channelError;

      setChannelName('');
      setIsPrivate(false);
      onClose();

      if (onChannelCreated) {
        onChannelCreated();
      }
    } catch (error) {
      console.error('Error creating channel:', error);
      alert('Kanal oluşturulurken bir hata oluştu');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 w-96 max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Kanal Oluştur</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleCreateChannel} className="space-y-4">
          {/* Channel Type Selection */}
          <div className="flex bg-gray-800 p-1 rounded-lg mb-4">
            <button
              type="button"
              onClick={() => setIsVoice(false)}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-all ${!isVoice ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-300'
                }`}
            >
              <Hash size={16} />
              Metin
            </button>
            <button
              type="button"
              onClick={() => setIsVoice(true)}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-all ${isVoice ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-300'
                }`}
            >
              <Volume2 size={16} />
              Ses
            </button>
          </div>

          {/* Channel Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Kanal Adı
            </label>
            <div className="relative">
              {isVoice ? (
                <Volume2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              ) : (
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              )}
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder={isVoice ? "Genel Sohbet" : "yeni-kanal"}
                className="w-full bg-gray-800 border border-gray-600 rounded pl-10 pr-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                maxLength={100}
                required
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {channelName.length}/100 karakter
            </p>
          </div>

          {/* Private Channel */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-300">
                Özel Kanal
              </label>
              <p className="text-xs text-gray-400">
                Sadece yetkili kullanıcılar görebilir
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsPrivate(!isPrivate)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isPrivate ? 'bg-blue-600' : 'bg-gray-600'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={!channelName.trim() || creating}
              className={`flex-1 py-2 px-4 rounded transition-colors ${channelName.trim() && !creating
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
            >
              {creating ? 'Oluşturuluyor...' : 'Kanal Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};