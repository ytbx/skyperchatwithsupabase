import { X, Tv, Monitor } from 'lucide-react';

interface ScreenShareQualityModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (quality: 'standard' | 'fullhd') => void;
}

export function ScreenShareQualityModal({ isOpen, onClose, onSelect }: ScreenShareQualityModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-xl w-full max-w-md flex flex-col shadow-2xl border border-gray-800 animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <h2 className="text-xl font-semibold text-white">Yayın Kalitesi Seçin</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <button
                        onClick={() => onSelect('standard')}
                        className="w-full group flex items-center gap-4 p-4 rounded-xl bg-gray-800 hover:bg-gray-700 transition-all border border-transparent hover:border-blue-500/50 text-left"
                    >
                        <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                            <Tv className="w-6 h-6 text-blue-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">Standart Kalite</h3>
                            <p className="text-sm text-gray-400">720p • 30 FPS • Daha az veri</p>
                        </div>
                    </button>

                    <button
                        onClick={() => onSelect('fullhd')}
                        className="w-full group flex items-center gap-4 p-4 rounded-xl bg-gray-800 hover:bg-gray-700 transition-all border border-transparent hover:border-green-500/50 text-left"
                    >
                        <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                            <Monitor className="w-6 h-6 text-green-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-white group-hover:text-green-400 transition-colors">Full HD Kalite</h3>
                            <p className="text-sm text-gray-400">1080p • 60 FPS • En iyi görüntü</p>
                        </div>
                    </button>
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-950/50 rounded-b-xl">
                    <p className="text-xs text-center text-gray-500">
                        Yayın kalitesi internet hızınıza göre değişkenlik gösterebilir.
                    </p>
                </div>
            </div>
        </div>
    );
}
