import React, { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface GifPlayerProps {
    src: string;
    alt: string;
    className?: string;
    onClick?: () => void;
}

export const GifPlayer: React.FC<GifPlayerProps> = ({ src, alt, className, onClick }) => {
    const [isHovering, setIsHovering] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = src;

        img.onload = () => {
            setIsLoaded(true);
            if (canvasRef.current) {
                const canvas = canvasRef.current;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                }
            }
        };

        img.onerror = () => {
            setHasError(true);
        };
    }, [src]);

    return (
        <div
            className={`relative inline-block overflow-hidden rounded-lg group ${className}`}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onClick={onClick}
        >
            {!isLoaded && !hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800/50">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
            )}

            {hasError ? (
                <div className="bg-gray-700 flex items-center justify-center text-xs text-gray-400 p-4">
                    GIF yüklenemedi
                </div>
            ) : (
                <>
                    <canvas
                        ref={canvasRef}
                        className={`max-w-full h-auto block rounded-lg ${isHovering ? 'hidden' : 'block'}`}
                    />
                    <img
                        ref={imgRef}
                        src={src}
                        alt={alt}
                        className={`max-w-full h-auto block rounded-lg ${isHovering ? 'block' : 'hidden'}`}
                    />
                    {!isHovering && isLoaded && (
                        <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider backdrop-blur-sm">
                            GIF
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
