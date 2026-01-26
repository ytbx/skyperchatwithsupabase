import { useState, useEffect } from 'react';
import { Mic, Speaker, Video, Check, X, Keyboard, AlertCircle, Sparkles } from 'lucide-react';
import { useDeviceSettings, Keybinds } from '@/contexts/DeviceSettingsContext';
import { useNoiseSuppression } from '@/contexts/NoiseSuppressionContext';


export function VoiceVideoSettings() {
    const {
        audioInputs,
        audioOutputs,
        videoInputs,
        audioInputDeviceId,
        audioOutputDeviceId,
        videoInputDeviceId,
        setAudioInputDeviceId,
        setAudioOutputDeviceId,
        setVideoInputDeviceId,
        refreshDevices,
        keybinds,
        setKeybind,
        clearKeybind,
        isElectron,
        showTaskbarController,
        setShowTaskbarController
    } = useDeviceSettings();

    const { isEnabled: isNoiseSuppressionEnabled, toggleNoiseSuppression } = useNoiseSuppression();


    const [recordingAction, setRecordingAction] = useState<keyof Keybinds | null>(null);

    // Refresh devices on mount
    useEffect(() => {
        refreshDevices();
    }, [refreshDevices]);

    // Handle key recording
    useEffect(() => {
        if (!recordingAction) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            // Ignore standalone modifier keys
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

            const modifiers = [];
            if (e.ctrlKey) modifiers.push('Ctrl');
            if (e.shiftKey) modifiers.push('Shift');
            if (e.altKey) modifiers.push('Alt');
            if (e.metaKey) modifiers.push('Meta');

            let key = e.key.toUpperCase();
            if (key === ' ') key = 'Space';

            const shortcut = [...modifiers, key].join('+');
            setKeybind(recordingAction, shortcut);
            setRecordingAction(null);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [recordingAction, setKeybind]);

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Device Selection Section */}
            <section className="space-y-6">
                <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">
                    Cihaz Ayarları
                </h3>

                <div className="grid gap-6">
                    {/* Input Device */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                            <Mic className="w-4 h-4" />
                            Giriş Aygıtı (Mikrofon)
                        </label>
                        <select
                            value={audioInputDeviceId}
                            onChange={(e) => setAudioInputDeviceId(e.target.value)}
                            className="w-full bg-gray-800 text-white border border-gray-600 rounded-md p-2.5 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                        >
                            <option value="default">Varsayılan</option>
                            {audioInputs.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Mikrofon ${device.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Output Device */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                            <Speaker className="w-4 h-4" />
                            Çıkış Aygıtı (Hoparlör)
                        </label>
                        <select
                            value={audioOutputDeviceId}
                            onChange={(e) => setAudioOutputDeviceId(e.target.value)}
                            className="w-full bg-gray-800 text-white border border-gray-600 rounded-md p-2.5 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                        >
                            <option value="default">Varsayılan</option>
                            {audioOutputs.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Hoparlör ${device.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Video Device */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                            <Video className="w-4 h-4" />
                            Kamera
                        </label>
                        <select
                            value={videoInputDeviceId}
                            onChange={(e) => setVideoInputDeviceId(e.target.value)}
                            className="w-full bg-gray-800 text-white border border-gray-600 rounded-md p-2.5 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                        >
                            <option value="default">Varsayılan</option>
                            {videoInputs.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Kamera ${device.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Noise Suppression Toggle */}
                    <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${isNoiseSuppressionEnabled ? 'bg-indigo-500/20 text-indigo-400' : 'bg-gray-700 text-gray-400'}`}>
                                <Sparkles className={`w-5 h-5 ${isNoiseSuppressionEnabled ? 'animate-pulse' : ''}`} />
                            </div>
                            <div>
                                <h4 className="text-white font-medium">Yapay Zeka Gürültü Engelleme</h4>
                                <p className="text-sm text-gray-400">Arka plan gürültülerini (klavye, fan vb.) temizler</p>
                            </div>
                        </div>

                        <button
                            onClick={toggleNoiseSuppression}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ring-offset-gray-900 focus:ring-2 focus:ring-primary-500 ${isNoiseSuppressionEnabled ? 'bg-indigo-600' : 'bg-gray-700'
                                }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isNoiseSuppressionEnabled ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                            />
                        </button>
                    </div>

                    {/* Taskbar Controller Toggle (Electron Only) */}
                    {isElectron && (
                        <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg transition-colors ${showTaskbarController ? 'bg-primary-500/20 text-primary-400' : 'bg-gray-700 text-gray-400'}`}>
                                    <Keyboard className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="text-white font-medium">Görev Çubuğu Kontrolcüsü</h4>
                                    <p className="text-sm text-gray-400">Windows görev çubuğu önizlemesinde kontrol butonlarını gösterir</p>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowTaskbarController(!showTaskbarController)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ring-offset-gray-900 focus:ring-2 focus:ring-primary-500 ${showTaskbarController ? 'bg-primary-600' : 'bg-gray-700'
                                    }`}
                            >
                                <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showTaskbarController ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                />
                            </button>
                        </div>
                    )}
                </div>
            </section>



            {/* Keybinds Section */}
            <section className="space-y-6">
                <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-2 flex items-center justify-between">
                    <span>Kısayol Tuşları</span>
                    {!isElectron && (
                        <div className="flex items-center gap-2 text-xs font-normal text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded">
                            <AlertCircle className="w-3 h-3" />
                            Sadece Masaüstü Uygulamasında Çalışır
                        </div>
                    )}
                </h3>

                <div className="grid gap-4">
                    {/* Mute Keybind */}
                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gray-700 rounded-lg">
                                <Mic className="w-5 h-5 text-gray-300" />
                            </div>
                            <div>
                                <h4 className="text-white font-medium">Mikrofonu Aç/Kapat</h4>
                                <p className="text-xs text-gray-400">Sesi tamamen kapatır</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setRecordingAction('mute')}
                                className={`px-4 py-2 min-w-[120px] text-sm font-mono border rounded-md transition-all ${recordingAction === 'mute'
                                    ? 'border-primary-500 text-primary-500 bg-primary-500/10 animate-pulse'
                                    : keybinds.mute
                                        ? 'border-gray-600 text-white bg-gray-700 hover:border-gray-500'
                                        : 'border-gray-600 text-gray-400 bg-gray-900/50 hover:border-gray-500'
                                    }`}
                            >
                                {recordingAction === 'mute'
                                    ? 'Tuşa Basın...'
                                    : keybinds.mute || 'Tuş Atanmadı'}
                            </button>
                            {keybinds.mute && (
                                <button
                                    onClick={() => clearKeybind('mute')}
                                    className="p-2 text-gray-400 hover:text-error transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Deafen Keybind */}
                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-gray-700 rounded-lg">
                                <Speaker className="w-5 h-5 text-gray-300" />
                            </div>
                            <div>
                                <h4 className="text-white font-medium">Sağırlaştır</h4>
                                <p className="text-xs text-gray-400">Gelen sesleri kapatır</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setRecordingAction('deafen')}
                                className={`px-4 py-2 min-w-[120px] text-sm font-mono border rounded-md transition-all ${recordingAction === 'deafen'
                                    ? 'border-primary-500 text-primary-500 bg-primary-500/10 animate-pulse'
                                    : keybinds.deafen
                                        ? 'border-gray-600 text-white bg-gray-700 hover:border-gray-500'
                                        : 'border-gray-600 text-gray-400 bg-gray-900/50 hover:border-gray-500'
                                    }`}
                            >
                                {recordingAction === 'deafen'
                                    ? 'Tuşa Basın...'
                                    : keybinds.deafen || 'Tuş Atanmadı'}
                            </button>
                            {keybinds.deafen && (
                                <button
                                    onClick={() => clearKeybind('deafen')}
                                    className="p-2 text-gray-400 hover:text-error transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Info Box */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3">
                <Keyboard className="w-5 h-5 text-blue-400 mt-0.5" />
                <div className="text-sm">
                    <p className="text-blue-200 font-medium">Kısayol Bilgisi</p>
                    <p className="text-blue-300/80 mt-1">
                        Atadığınız kısayol tuşları, masaüstü uygulamasında pencere simge durumuna küçültülmüş olsa bile çalışmaya devam edecektir.
                    </p>
                </div>
            </div>
        </div>
    );
}
