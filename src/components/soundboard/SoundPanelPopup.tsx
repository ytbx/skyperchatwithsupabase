import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { SoundPanel } from './SoundPanel';

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
            className={`absolute z-50 ${anchorPosition === 'top'
                    ? 'bottom-full mb-2'
                    : 'top-full mt-2'
                } left-1/2 transform -translate-x-1/2 w-80 sm:w-96 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden animate-fade-in-up`}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-850 border-b border-gray-700">
                <span className="text-white font-semibold text-sm">🎵 Ses Paneli</span>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                >
                    <X size={16} className="text-gray-400 hover:text-white" />
                </button>
            </div>

            {/* Content */}
            <SoundPanel onPlaySound={onPlaySound} audioContext={audioContext} />
        </div>
    );
};
