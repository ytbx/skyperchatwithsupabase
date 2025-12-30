import React, { useState } from 'react';
import { Volume2, VolumeX, Volume1 } from 'lucide-react';

interface StreamVolumeControlProps {
    volume: number;
    onVolumeChange: (volume: number) => void;
    isMuted?: boolean;
    className?: string;
}

export function StreamVolumeControl({
    volume,
    onVolumeChange,
    isMuted = false,
    className = ""
}: StreamVolumeControlProps) {
    const [isHovered, setIsHovered] = useState(false);

    const getIcon = () => {
        if (isMuted || volume === 0) return <VolumeX className="w-5 h-5" />;
        if (volume < 0.5) return <Volume1 className="w-5 h-5" />;
        return <Volume2 className="w-5 h-5" />;
    };

    return (
        <div
            className={`relative group/volume ${className}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Vertical Slider Wrapper */}
            <div className={`absolute bottom-[100%] left-1/2 -translate-x-1/2 flex flex-col items-center pb-2 z-20 transition-all duration-200 origin-bottom ${isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
                }`}>
                <div className="p-3 bg-gray-900 shadow-2xl rounded-xl border border-white/10 backdrop-blur-md">
                    <div className="h-32 flex flex-col items-center gap-2">
                        <span className="text-[10px] font-bold text-blue-400 tabular-nums">
                            {Math.round(volume * 100)}%
                        </span>
                        <div className="relative flex-1 w-2 bg-gray-700/50 rounded-full overflow-hidden">
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={volume}
                                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                style={{
                                    appearance: 'slider-vertical',
                                    writingMode: 'bt-lr'
                                } as any}
                            />
                            {/* Custom Track */}
                            <div
                                className="absolute bottom-0 left-0 right-0 bg-blue-500 transition-all duration-150"
                                style={{ height: `${volume * 100}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Icon Button */}
            <button
                className={`p-2 rounded-lg transition-all duration-200 ${isHovered
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'bg-black/40 text-white/80 hover:bg-black/60 hover:text-white'
                    }`}
            >
                {getIcon()}
            </button>
        </div>
    );
}
