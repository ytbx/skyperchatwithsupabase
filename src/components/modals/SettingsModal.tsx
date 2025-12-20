import { useState, useRef } from 'react';
import { X, LogOut, User, Upload, Loader2, Video } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { FileUploadService } from '@/services/FileUploadService';
import { VoiceVideoSettings } from '@/components/settings/VoiceVideoSettings';
import { toast } from 'sonner';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { profile, signOut, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'account' | 'voice-video'>('profile');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  async function handleSignOut() {
    await signOut();
    onClose();
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    const validation = FileUploadService.validateFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setIsUploadingAvatar(true);
    try {
      await FileUploadService.uploadAvatar(profile.id, file);
      toast.success('Avatar başarıyla güncellendi!');

      // Refresh profile to show new avatar
      if (refreshProfile) {
        await refreshProfile();
      }
    } catch (error) {
      console.error('Avatar upload error:', error);
      toast.error('Avatar yüklenirken bir hata oluştu');
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-gray-700 rounded-lg w-full max-w-4xl h-[600px] shadow-glow-lg animate-fade-in flex">
        {/* Sidebar */}
        <div className="w-56 bg-gray-800 p-4 border-r border-neutral-200 rounded-l-lg">
          <div className="space-y-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full px-3 py-2 text-left rounded transition-colors ${activeTab === 'profile'
                ? 'bg-primary-500/10 text-primary-500'
                : 'text-gray-200 hover:bg-gray-700'
                }`}
            >
              Profil
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`w-full px-3 py-2 text-left rounded transition-colors ${activeTab === 'account'
                ? 'bg-primary-500/10 text-primary-500'
                : 'text-gray-200 hover:bg-gray-700'
                }`}
            >
              Hesap
            </button>
            <button
              onClick={() => setActiveTab('voice-video')}
              className={`w-full px-3 py-2 text-left rounded transition-colors flex items-center gap-2 ${activeTab === 'voice-video'
                ? 'bg-primary-500/10 text-primary-500'
                : 'text-gray-200 hover:bg-gray-700'
                }`}
            >
              <Video className="w-4 h-4" />
              Ses ve Görüntü
            </button>
          </div>

          <div className="mt-auto pt-8">
            <button
              onClick={handleSignOut}
              className="w-full px-3 py-2 text-left text-error hover:bg-error/10 rounded transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Çıkış Yap
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
            <h2 className="text-2xl font-semibold text-white">
              {activeTab === 'profile' && 'Profil'}
              {activeTab === 'account' && 'Hesap'}
              {activeTab === 'voice-video' && 'Ses ve Görüntü'}
            </h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-600 rounded transition-colors"
            >
              <X className="w-5 h-5 text-neutral-600" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-primary-500 flex items-center justify-center relative">
                    {profile?.profile_image_url ? (
                      <img
                        src={profile.profile_image_url}
                        alt=""
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <User className="w-10 h-10 text-white" />
                    )}
                    {isUploadingAvatar && (
                      <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      className="px-4 py-2 bg-primary-500 text-white rounded hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isUploadingAvatar ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Yükleniyor...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Avatar Değiştir
                        </>
                      )}
                    </button>
                    <p className="text-xs text-gray-400 mt-2">Maksimum 1MB</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    Kullanıcı Adı
                  </label>
                  <input
                    type="text"
                    value={profile?.username || ''}
                    readOnly
                    className="w-full bg-gray-800 border border-neutral-200 rounded px-4 py-3 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">
                    E-posta
                  </label>
                  <input
                    type="email"
                    value={profile?.email || ''}
                    readOnly
                    className="w-full bg-gray-800 border border-neutral-200 rounded px-4 py-3 text-white"
                  />
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Hesap Bilgileri</h3>
                  <p className="text-neutral-600 mb-4">
                    Hesabınız {new Date(profile?.created_at || '').toLocaleDateString('tr-TR')} tarihinde oluşturuldu.
                  </p>
                </div>

                <div className="pt-6 border-t border-neutral-200">
                  <h3 className="text-lg font-semibold text-error mb-2">Tehlikeli Bölge</h3>
                  <p className="text-neutral-600 mb-4">
                    Bu işlemler geri alınamaz. Lütfen dikkatli olun.
                  </p>
                  <button className="px-4 py-2 bg-error text-white rounded hover:bg-error/90 transition-colors">
                    Hesabı Sil
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'voice-video' && (
              <VoiceVideoSettings />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
