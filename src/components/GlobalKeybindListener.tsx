import { useEffect } from 'react';
import { toast } from 'sonner';
import { useDeviceSettings } from '@/contexts/DeviceSettingsContext';
import { useCall } from '@/contexts/CallContext';
import { useVoiceChannel } from '@/contexts/VoiceChannelContext';

export function GlobalKeybindListener() {
    const { keybinds, isElectron } = useDeviceSettings();
    // Get call actions
    const {
        activeCall,
        toggleMic: toggleCallMic,
        toggleDeafen: toggleCallDeafen
    } = useCall();

    // Get voice channel actions
    const {
        isConnected,
        toggleMute: toggleVoiceMute,
        toggleDeafen: toggleVoiceDeafen
    } = useVoiceChannel();

    useEffect(() => {
        if (!isElectron || !(window as any).electron?.globalShortcuts) return;

        console.log('[GlobalKeybindListener] Initializing listener with keybinds:', keybinds);

        const cleanup = (window as any).electron.globalShortcuts.onTriggered((accelerator: string) => {
            console.log('[GlobalKeybindListener] Shortcut triggered:', accelerator);

            // Normalize helper: remove spaces, lowercase
            const normalize = (str: string) => str.replace(/\s+/g, '').toLowerCase();
            const normalizedAcc = normalize(accelerator);
            const normalizedMute = keybinds.mute ? normalize(keybinds.mute) : '';
            const normalizedDeafen = keybinds.deafen ? normalize(keybinds.deafen) : '';

            // Mute Action
            if (normalizedMute && normalizedAcc === normalizedMute) {
                console.log('[GlobalKeybindListener] Executing Mute Toggle');
                let handled = false;

                // Toggle for Direct Call
                if (activeCall) {
                    console.log('[GlobalKeybindListener] Toggling call mic');
                    toggleCallMic();
                    handled = true;
                }

                // Toggle for Voice Channel
                if (isConnected) {
                    console.log('[GlobalKeybindListener] Toggling voice channel mute');
                    toggleVoiceMute();
                    handled = true;
                }

                if (handled) {
                    toast.success('Mikrofon değiştirildi', { id: 'mute-toggle' });
                } else {
                    toast.info('Mikrofon kısayolu çalıştı (Aktif arama yok)', { id: 'mute-toggle-info' });
                }
            }

            // Deafen Action
            if (normalizedDeafen && normalizedAcc === normalizedDeafen) {
                console.log('[GlobalKeybindListener] Executing Deafen Toggle');
                let handled = false;

                // Toggle for Direct Call
                if (activeCall) {
                    console.log('[GlobalKeybindListener] Toggling call deafen');
                    toggleCallDeafen();
                    handled = true;
                }

                // Toggle for Voice Channel
                if (isConnected) {
                    console.log('[GlobalKeybindListener] Toggling voice channel deafen');
                    toggleVoiceDeafen();
                    handled = true;
                }

                if (handled) {
                    toast.success('Sağırlaştırma değiştirildi', { id: 'deafen-toggle' });
                } else {
                    toast.info('Sağırlaştırma kısayolu çalıştı (Aktif arama yok)', { id: 'deafen-toggle-info' });
                }
            }
        });

        return cleanup;
    }, [
        isElectron,
        keybinds,
        activeCall,
        isConnected,
        toggleCallMic,
        toggleVoiceMute,
        toggleCallDeafen,
        toggleVoiceDeafen
    ]);

    return null;
}
