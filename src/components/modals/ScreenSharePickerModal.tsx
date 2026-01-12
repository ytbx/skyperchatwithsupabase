import { useState, useEffect } from 'react';
import { X, Monitor, AppWindow } from 'lucide-react';
import { DesktopCapturerSource } from '@/types/electron';

interface ScreenSharePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (sourceId: string, quality: 'standard' | 'fullhd', shareAudio: boolean) => void;
}

export function ScreenSharePickerModal({ isOpen, onClose, onSelect }: ScreenSharePickerModalProps) {
    const [sources, setSources] = useState<DesktopCapturerSource[]>([]);
    const [activeTab, setActiveTab] = useState<'screen' | 'window'>('screen');
    const [quality, setQuality] = useState<'standard' | 'fullhd'>('standard');
    const [shareAudio, setShareAudio] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadSources();
        }
    }, [isOpen]);

    const loadSources = async () => {
        setIsLoading(true);
        try {
            const desktopSources = await window.electron.getDesktopSources();
            setSources(desktopSources);
        } catch (error) {
            console.error('Error loading desktop sources:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    const filteredSources = sources.filter(source =>
        activeTab === 'screen'
            ? source.id.startsWith('screen')
            : source.id.startsWith('window')
    );

    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl border border-gray-800">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <h2 className="text-xl font-semibold text-white">Ekran Paylaşımı</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex p-4 gap-4">
                    <button
                        onClick={() => setActiveTab('screen')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${activeTab === 'screen'
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                    >
                        <Monitor className="w-4 h-4" />
                        Ekranlar
                    </button>
                    <button
                        onClick={() => setActiveTab('window')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${activeTab === 'window'
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                    >
                        <AppWindow className="w-4 h-4" />
                        Pencereler
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 min-h-[400px]">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {filteredSources.map((source) => (
                                <button
                                    key={source.id}
                                    onClick={() => onSelect(source.id, quality, shareAudio)}
                                    className="group flex flex-col gap-2 p-3 rounded-xl bg-gray-800 hover:bg-gray-700 transition-all hover:scale-[1.02] border border-transparent hover:border-primary-500/50"
                                >
                                    <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden">
                                        <img
                                            src={source.thumbnail.toDataURL()}
                                            alt={source.name}
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                    <span className="text-sm text-gray-300 group-hover:text-white truncate w-full text-left font-medium">
                                        {source.name}
                                    </span>
                                </button>
                            ))}
                            {filteredSources.length === 0 && (
                                <div className="col-span-full flex flex-col items-center justify-center text-gray-500 py-10">
                                    <p>Görüntülenecek kaynak bulunamadı</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-800 flex items-center justify-between bg-gray-900/50">
                    <div className="flex items-center gap-4">
                        <div className="flex bg-gray-800 p-1 rounded-lg">
                            <button
                                onClick={() => setQuality('standard')}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${quality === 'standard'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-400 hover:text-gray-200'
                                    }`}
                            >
                                Standart (720p)
                            </button>
                            <button
                                onClick={() => setQuality('fullhd')}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${quality === 'fullhd'
                                    ? 'bg-green-600 text-white shadow-sm'
                                    : 'text-gray-400 hover:text-gray-200'
                                    }`}
                            >
                                Full HD (1080p)
                            </button>
                        </div>

                        {/* Share Audio Checkbox */}
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={shareAudio}
                                onChange={(e) => setShareAudio(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-primary-500 focus:ring-primary-500/50"
                            />
                            <span className="text-sm text-gray-300">Sesi Paylaş</span>
                        </label>
                    </div>

                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        İptal
                    </button>
                </div>
            </div>
        </div>
    );
}
