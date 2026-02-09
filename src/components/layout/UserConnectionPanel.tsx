import React, { useState } from 'react';
import { Settings, Volume2, Mic, MicOff, Headphones, PhoneOff, MonitorUp, Video, VideoOff, Music2, VolumeX, Phone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useVoiceChannel } from '@/contexts/VoiceChannelContext';
import { useCall } from '@/contexts/CallContext';
import { SoundPanelPopup } from '@/components/soundboard/SoundPanelPopup';
import { useSupabaseRealtime } from '@/contexts/SupabaseRealtimeContext';
import { supabase } from '@/lib/supabase';

export const UserConnectionPanel: React.FC = () => {
    const { profile } = useAuth();
    const {
        activeChannelId: voiceChannelId,
        leaveChannel: leaveVoice,
        isMuted: isVoiceMuted,
        isDeafened: isVoiceDeafened,
        isScreenSharing: isVoiceScreenSharing,
        isCameraEnabled: isVoiceCameraEnabled,
        toggleMute: toggleVoiceMute,
        toggleDeafen: toggleVoiceDeafen,
        toggleScreenShare: toggleVoiceScreenShare,
        toggleCamera: toggleVoiceCamera,
        playSoundboardAudio: playVoiceSoundboard
    } = useVoiceChannel();

    const {
        activeCall,
        endCall: endDirectCall,
        isMicMuted: isCallMuted,
        isDeafened: isCallDeafened,
        isScreenSharing: isCallScreenSharing,
        isCameraOff: isCallCameraOff,
        toggleMic: toggleCallMic,
        toggleDeafen: toggleCallDeafen,
        toggleScreenShare: toggleCallScreenShare,
        toggleCamera: toggleCallCamera,
        playSoundboardAudio: playCallSoundboard
    } = useCall();

    const {
        isIdle
    } = useSupabaseRealtime();

    const [showSoundPanel, setShowSoundPanel] = useState(false);

    // Determine active context (Call takes precedence if both active? unlikely)
    const isCallActive = !!activeCall;
    const isVoiceActive = !!voiceChannelId;

    // Derived states
    const isMuted = isCallActive ? isCallMuted : isVoiceMuted;
    const isDeafened = isCallActive ? isCallDeafened : isVoiceDeafened;
    const isScreenSharing = isCallActive ? isCallScreenSharing : isVoiceScreenSharing;
    const isCameraEnabled = isCallActive ? !isCallCameraOff : isVoiceCameraEnabled;

    // Actions
    const handleToggleMute = isCallActive ? toggleCallMic : toggleVoiceMute;
    const handleToggleDeafen = isCallActive ? toggleCallDeafen : toggleVoiceDeafen;
    const handleToggleScreenShare = isCallActive ? toggleCallScreenShare : toggleVoiceScreenShare;
    const handleToggleCamera = isCallActive ? toggleCallCamera : toggleVoiceCamera;
    const handlePlaySound = isCallActive ? playCallSoundboard : playVoiceSoundboard;

    // Logic to get channel name (needed to pass channels down or fetch?)
    // useVoiceChannel exports `channels`? 
    // Wait, ChannelList had `channels` in its local state. 
    // VoiceChannelContext doesn't typically expose the full list of channels unless we added it.
    // Checking VoiceChannelContext... 
    // It usually only has activeChannelId.
    // I might need to fetch the channel name if it's not in context.
    // Or simpler: just show "Ses Kanalı". The user showed "ses1" in the screenshot.
    // I'll check VoiceChannelContext exports in a moment. If it doesn't have channel name, I might need to query it or accept it's just "Ses Bağlantısı".
    // For now, I'll use a generic name or "Ses Kanalı" if I can't find it. 
    // BUT! In `ChannelList`, `voiceChannels` was local state.
    // So `UserConnectionPanel` won't know the channel name unless I pass it or context has it.
    // I'll stick to a generic approach or try to fetch.

    // Actually, `activeChannelId` is just an ID. 
    // I can useEffect to fetch channel Name if activeChannelId changes.
    // Let's do that for polish.

    const [channelName, setChannelName] = useState<string>('');

    React.useEffect(() => {
        if (!voiceChannelId) {
            setChannelName('');
            return;
        }

        const fetchChannelName = async () => {
            const { data, error } = await supabase
                .from('channels')
                .select('name')
                .eq('id', voiceChannelId)
                .single();

            if (data && !error) {
                setChannelName(data.name);
            }
        };

        fetchChannelName();
    }, [voiceChannelId]);


    return (
        <div className="flex-none bg-gray-900 border-t border-gray-800 flex flex-col w-full">
            {/* Connection Status Green Box */}
            {(isVoiceActive || isCallActive) && (
                <div className="px-2 pt-2">
                    <div className="flex items-center justify-between px-2 py-1.5 bg-green-900/20 rounded border border-green-900/50">
                        <div className="flex items-center gap-2 overflow-hidden">
                            {isCallActive ? (
                                <Phone className="w-4 h-4 text-green-500 flex-shrink-0" />
                            ) : (
                                <Volume2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                            )}
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-green-500 truncate">
                                    {isCallActive ? 'Sesli Arama' : 'Ses Bağlantısı'}
                                </span>
                                <span className="text-xs text-gray-400 truncate">
                                    {isCallActive
                                        ? (activeCall?.callee_id === profile?.id ? 'Gelen Arama' : activeCall?.caller_id === profile?.id ? 'Giden Arama' : 'Bağlı')
                                        : (channelName || 'Ses Kanalı')}
                                    {/* Note: Channel name fetching to be implemented */}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                if (isCallActive) endDirectCall();
                                else leaveVoice();
                            }}
                            className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                            title="Bağlantıyı Kes"
                        >
                            <PhoneOff size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Controls Row */}
            <div className={`flex items-center justify-center gap-2 md:gap-4 py-2 ${(isVoiceActive || isCallActive) ? 'pt-2' : ''}`}>
                <button
                    onClick={handleToggleMute}
                    className={`p-2 rounded-full transition-colors ${isMuted
                        ? 'bg-red-500/20 text-red-500'
                        : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                    title={isMuted ? "Sesi Aç" : "Sessize Al"}
                >
                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button
                    onClick={handleToggleDeafen}
                    className={`p-2 rounded-full transition-colors ${isDeafened
                        ? 'bg-red-500/20 text-red-500'
                        : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                    title={isDeafened ? "Sağırlaştır" : "Sağırlaştır"}
                >
                    <Headphones size={20} />
                </button>
                <button
                    onClick={handleToggleScreenShare}
                    className={`p-2 rounded-full transition-colors ${isScreenSharing
                        ? 'bg-green-500/20 text-green-500'
                        : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                    disabled={!isVoiceActive && !isCallActive}
                    title={isScreenSharing ? "Paylaşımı Durdur" : "Ekran Paylaş"}
                >
                    <MonitorUp size={20} />
                </button>
                <button
                    onClick={handleToggleCamera}
                    className={`p-2 rounded-full transition-colors ${isCameraEnabled
                        ? 'bg-blue-500/20 text-blue-500'
                        : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                    disabled={!isVoiceActive && !isCallActive}
                    title={isCameraEnabled ? "Kamerayı Kapat" : "Kamerayı Aç"}
                >
                    {isCameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                </button>

                {/* Sound Panel */}
                <div className="relative">
                    <button
                        onClick={() => setShowSoundPanel(!showSoundPanel)}
                        className={`p-2 rounded-full transition-colors ${showSoundPanel
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'hover:bg-gray-800 text-gray-400 hover:text-gray-200'}`}
                        title="Ses Paneli"
                    >
                        <Music2 size={20} />
                    </button>
                    <SoundPanelPopup
                        isOpen={showSoundPanel}
                        onClose={() => setShowSoundPanel(false)}
                        anchorPosition="top"
                        onPlaySound={handlePlaySound}
                    />
                </div>
            </div>

            {/* User Profile Bar */}
            <div className="h-14 px-3 flex items-center gap-3 bg-gray-900 border-t border-gray-800">
                <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center overflow-hidden">
                        {profile?.profile_image_url ? (
                            <img src={profile.profile_image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-sm font-semibold text-white">
                                {profile?.username?.charAt(0).toUpperCase() || 'U'}
                            </span>
                        )}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ${isIdle ? 'bg-blue-500' : 'bg-green-500'} border-[3px] border-gray-900`} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                        {profile?.username || 'Kullanıcı'}
                    </div>
                    <div className="text-xs text-gray-400">
                        {isCallActive ? 'Görüşmede' : isVoiceActive ? 'Sesli Kanalda' : (isIdle ? 'Boşta' : 'Çevrimiçi')}
                    </div>
                </div>
                <button
                    className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                    title="Ayarlar"
                    onClick={() => {
                        // Implement settings modal trigger if needed, or pass as prop
                        const settingsBtn = document.getElementById('user-settings-trigger');
                        if (settingsBtn) settingsBtn.click();
                        else {
                            // Fallback or dispatch event
                            window.dispatchEvent(new CustomEvent('open-settings'));
                        }
                    }}
                >
                    <Settings size={20} />
                </button>

                {/* Invisible trigger for settings if needed external control */}
            </div>
        </div>
    );
};
