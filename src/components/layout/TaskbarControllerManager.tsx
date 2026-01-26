import { useEffect, useRef } from 'react';
import { useVoiceChannel } from '@/contexts/VoiceChannelContext';
import { useCall } from '@/contexts/CallContext';
import { useDeviceSettings } from '@/contexts/DeviceSettingsContext';
import { useAuth } from '@/contexts/AuthContext';

export function TaskbarControllerManager() {
    const {
        activeChannelId,
        isMuted: isVoiceMuted,
        isDeafened: isVoiceDeafened,
        toggleMute: toggleVoiceMute,
        toggleDeafen: toggleVoiceDeafen,
        participants: voiceParticipants
    } = useVoiceChannel();

    const {
        activeCall,
        callStatus,
        isMicMuted: isCallMuted,
        isDeafened: isCallDeafened,
        toggleMic: toggleCallMic,
        toggleDeafen: toggleCallDeafen
    } = useCall();

    const { isElectron, showTaskbarController } = useDeviceSettings();
    const { user } = useAuth();

    const isVoiceActive = !!activeChannelId;
    const isCallActive = !!activeCall && (callStatus === 'active' || callStatus === 'connecting');
    const isActive = isVoiceActive || isCallActive;

    const isMuted = isCallActive ? isCallMuted : isVoiceMuted;
    const isDeafened = isCallActive ? isCallDeafened : isVoiceDeafened;

    // Helper to generate base64 icons from raw paths/strings isn't ideal,
    // so we'll use a canvas to draw simple icons or just predefined base64 strings if we had them.
    // For now, let's create a helper to draw icons.
    const drawIcon = (type: 'mic' | 'mic-off' | 'deafen' | 'deafen-off') => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        // Clear canvas
        ctx.clearRect(0, 0, 32, 32);

        // Background
        if (type === 'mic-off' || type === 'deafen-off') {
            ctx.fillStyle = '#ef4444'; // Red background for off states
            ctx.fillRect(0, 0, 32, 32);
        } else {
            ctx.fillStyle = 'transparent';
            ctx.fillRect(0, 0, 32, 32);
        }

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (type === 'mic') {
            // Simple mic icon
            ctx.beginPath();
            ctx.roundRect(11, 4, 10, 16, 5);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(16, 14, 10, 0, Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(16, 24); ctx.lineTo(16, 28);
            ctx.stroke();
        } else if (type === 'mic-off') {
            // Mic with slash - White strokes on red background
            ctx.beginPath();
            ctx.roundRect(11, 4, 10, 16, 5);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(16, 14, 10, 0, Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(16, 24); ctx.lineTo(16, 28);
            ctx.stroke();
            // Diagonal slash
            ctx.beginPath();
            ctx.moveTo(8, 8); ctx.lineTo(24, 24); // Adjusted slash coordinates for better visibility
            ctx.stroke();
        } else if (type === 'deafen') {
            // Headphones
            ctx.beginPath();
            ctx.arc(16, 16, 10, Math.PI, 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.roundRect(4, 16, 6, 8, 2);
            ctx.roundRect(22, 16, 6, 8, 2);
            ctx.stroke();
        } else if (type === 'deafen-off') {
            // Headphones with slash - White strokes on red background
            ctx.beginPath();
            ctx.arc(16, 16, 10, Math.PI, 0);
            ctx.stroke();
            ctx.beginPath();
            ctx.roundRect(4, 16, 6, 8, 2);
            ctx.roundRect(22, 16, 6, 8, 2);
            ctx.stroke();
            // Diagonal slash
            ctx.beginPath();
            ctx.moveTo(8, 8); ctx.lineTo(24, 24); // Adjusted slash coordinates
            ctx.stroke();
        }

        return canvas.toDataURL();
    };

    const updateThumbar = () => {
        if (!isElectron || !showTaskbarController || !(window as any).electron?.thumbar) return;

        if (!isActive) {
            (window as any).electron.thumbar.clearButtons();
            return;
        }

        const buttons = [
            {
                id: 'toggle-mute',
                tooltip: isMuted ? 'Sesi Aç' : 'Sessize Al',
                iconBase64: drawIcon(isMuted ? 'mic-off' : 'mic'),
            },
            {
                id: 'toggle-deafen',
                tooltip: isDeafened ? 'Kulaklığı Aç' : 'Sağırlaştır',
                iconBase64: drawIcon(isDeafened ? 'deafen-off' : 'deafen'),
            }
        ];

        (window as any).electron.thumbar.setButtons(buttons);
    };

    useEffect(() => {
        updateThumbar();
    }, [isActive, isMuted, isDeafened, showTaskbarController]);

    useEffect(() => {
        if (!isElectron || !(window as any).electron?.thumbar) return;

        const unsubscribe = (window as any).electron.thumbar.onButtonClicked((id: string) => {
            console.log('[TaskbarController] Button clicked:', id);
            if (id === 'toggle-mute') {
                if (isCallActive) toggleCallMic();
                else toggleVoiceMute();
            } else if (id === 'toggle-deafen') {
                if (isCallActive) toggleCallDeafen();
                else toggleVoiceDeafen();
            } else if (id === 'maximize') {
                // Focus the window - the app should already have logic to show when clicked from tray or taskbar
                // but we can send a maximize event if needed. For now, we assume the user just wants to see the app.
            }
        });

        return () => unsubscribe();
    }, [isCallActive, toggleCallMic, toggleVoiceMute, toggleCallDeafen, toggleVoiceDeafen]);

    return null; // Logic only component
}
