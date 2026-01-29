import React, { useRef, useEffect } from 'react';
import { X, Volume2, VolumeX } from 'lucide-react';
import { SoundPanel } from './SoundPanel';
import { useUserAudio } from '@/contexts/UserAudioContext';

interface SoundPanelPopupProps {
    isOpen: boolean;
    onClose: () => void;
    anchorPosition?: 'top' | 'bottom';
    onPlaySound?: (audioBuffer: AudioBuffer) => void;
    audioContext?: AudioContext;
}

export const SoundPanelPopup: React.FC<SoundPanelPopupProps> = ({
    isOpen,
    onClose,
    anchorPosition = 'top',
    onPlaySound,
    audioContext
}) => {
    const popupRef = useRef<HTMLDivElement>(null);
    const { isGlobalSoundpadMuted, toggleGlobalSoundpadMute } = useUserAudio();

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            // Small delay to prevent immediate close on the same click that opened it
            setTimeout(() => {
                document.addEventListener('mousedown', handleClickOutside);
            }, 100);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    // Close on escape
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            ref={popupRef}
            className={`absolute z-[2000] ${anchorPosition === 'top'
                ? 'bottom-full mb-3'
                : 'top-full mt-3'
                } left-1/2 transform -translate-x-1/2 w-[340px] sm:w-[400px] bg-[#1e1f22] border border-[#2b2d31] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden animate-fade-in-up flex flex-col max-h-[80vh]`}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#1e1f22] border-b border-[#2b2d31]">
                <div className="flex items-center gap-2">
                    <span className="text-[#dbdee1] font-bold text-sm tracking-wide">SES PANELİ</span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Soundpad Mute Button */}
                    <button
                        onClick={toggleGlobalSoundpadMute}
                        className={`p-2 rounded-lg transition-all duration-200 ${isGlobalSoundpadMuted
                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            : 'hover:bg-[#35373c] text-[#b5bac1] hover:text-white'
                            }`}
                        title={isGlobalSoundpadMuted ? "Soundpad Seslerini Aç" : "Soundpad Seslerini Kapat"}
                    >
                        {isGlobalSoundpadMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-[#35373c] rounded-lg transition-colors text-[#b5bac1] hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Soundpad Mute Indicator */}
            {isGlobalSoundpadMuted && (
                <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 mx-3 my-2 rounded-lg">
                    <div className="flex items-center gap-2 text-red-400 text-xs font-medium">
                        <VolumeX size={14} />
                        <span>Soundpad sesleri kapatıldı</span>
                    </div>
                </div>
            )}

            {/* Content Container */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <SoundPanel onPlaySound={onPlaySound} audioContext={audioContext} />
            </div>
        </div>
    );
};
