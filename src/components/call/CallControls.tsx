import React, { useState } from 'react';
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff, Music2 } from 'lucide-react';
import { SoundPanelPopup } from '@/components/soundboard/SoundPanelPopup';

interface CallControlsProps {
    isMicMuted: boolean;
    isCameraOff: boolean;
    isScreenSharing: boolean;
    onMicToggle: () => void;
    onCameraToggle: () => void;
    onScreenShareToggle: () => void;
    onEndCall: () => void;
    showCamera?: boolean;
    showScreenShare?: boolean;
    onPlaySound?: (audioBuffer: AudioBuffer) => void;
    audioContext?: AudioContext;
}

export const CallControls: React.FC<CallControlsProps> = ({
    isMicMuted,
    isCameraOff,
    isScreenSharing,
    onMicToggle,
    onCameraToggle,
    onScreenShareToggle,
    onEndCall,
    showCamera = true,
    showScreenShare = true,
    onPlaySound,
    audioContext
}) => {
    const [showSoundPanel, setShowSoundPanel] = useState(false);

    return (
        <div className="flex items-center justify-center space-x-3 p-4 bg-gray-900/90 backdrop-blur-sm rounded-lg">
            {/* Microphone Toggle */}
            <button
                onClick={onMicToggle}
                className={`p-4 rounded-full transition-all ${isMicMuted
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
                {isMicMuted ? (
                    <MicOff size={20} className="text-white" />
                ) : (
                    <Mic size={20} className="text-white" />
                )}
            </button>

            {/* Camera Toggle */}
            {showCamera && (
                <button
                    onClick={onCameraToggle}
                    className={`p-4 rounded-full transition-all ${isCameraOff
                        ? 'bg-red-600 hover:bg-red-700'
                        : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                    title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
                >
                    {isCameraOff ? (
                        <VideoOff size={20} className="text-white" />
                    ) : (
                        <Video size={20} className="text-white" />
                    )}
                </button>
            )}

            {/* Screen Share Toggle */}
            {showScreenShare && (
                <button
                    onClick={onScreenShareToggle}
                    className={`p-4 rounded-full transition-all ${isScreenSharing
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                    title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
                >
                    {isScreenSharing ? (
                        <MonitorOff size={20} className="text-white" />
                    ) : (
                        <Monitor size={20} className="text-white" />
                    )}
                </button>
            )}

            {/* Sound Panel Button - Shows for all users */}
            <div className="relative">
                <button
                    onClick={() => setShowSoundPanel(!showSoundPanel)}
                    className={`p-4 rounded-full transition-all ${showSoundPanel
                        ? 'bg-purple-600 hover:bg-purple-700'
                        : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                    title="Ses Paneli"
                >
                    <Music2 size={20} className="text-white" />
                </button>
                <SoundPanelPopup
                    isOpen={showSoundPanel}
                    onClose={() => setShowSoundPanel(false)}
                    anchorPosition="top"
                    onPlaySound={onPlaySound}
                    audioContext={audioContext}
                />
            </div>

            {/* End Call Button */}
            <button
                onClick={onEndCall}
                className="p-4 rounded-full bg-red-600 hover:bg-red-700 transition-all"
                title="End call"
            >
                <PhoneOff size={20} className="text-white" />
            </button>
        </div>
    );
};
