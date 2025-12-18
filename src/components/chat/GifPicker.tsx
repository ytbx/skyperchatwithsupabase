import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, Sticker } from 'lucide-react';
import { gifService, TenorGif } from '../../services/GifService';

interface GifPickerProps {
    onGifSelect: (gifUrl: string, width?: number, height?: number) => void;
}

export const GifPicker: React.FC<GifPickerProps> = ({ onGifSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [gifs, setGifs] = useState<TenorGif[]>([]);
    const [loading, setLoading] = useState(false);
    const [nextPos, setNextPos] = useState<string | undefined>();
    const containerRef = useRef<HTMLDivElement>(null);

    // Debounce search
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Handle outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const loadGifs = useCallback(async (query: string, pos?: string) => {
        setLoading(true);
        try {
            const response = query.trim()
                ? await gifService.searchGifs(query, 20, pos)
                : await gifService.getTrendingGifs(20, pos);

            if (pos) {
                setGifs(prev => [...prev, ...response.results]);
            } else {
                setGifs(response.results);
            }
            setNextPos(response.next);
        } catch (error) {
            console.error('Error loading GIFs:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen && gifs.length === 0) {
            loadGifs('');
        }
    }, [isOpen, loadGifs]);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = setTimeout(() => {
            loadGifs(query);
        }, 500);
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 100 && !loading && nextPos) {
            loadGifs(searchQuery, nextPos);
        }
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`p-2 hover:bg-gray-700 rounded-lg transition-colors ${isOpen ? 'text-white bg-gray-700' : 'text-gray-400 hover:text-white'}`}
                title="GIF Gönder"
            >
                <Sticker size={20} />
            </button>

            {isOpen && (
                <div className="absolute bottom-full mb-2 right-0 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex flex-col h-96">
                        {/* Header / Search */}
                        <div className="p-3 border-b border-gray-800">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input
                                    type="text"
                                    placeholder="GIF Ara..."
                                    value={searchQuery}
                                    onChange={handleSearch}
                                    className="w-full bg-gray-800 text-white text-sm rounded-full pl-9 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* GIF Grid */}
                        <div
                            className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
                            onScroll={handleScroll}
                        >
                            <div className="grid grid-cols-2 gap-2">
                                {gifs.map((gif) => (
                                    <button
                                        key={gif.id}
                                        onClick={() => {
                                            onGifSelect(gif.media_formats.gif.url, gif.media_formats.gif.dims[0], gif.media_formats.gif.dims[1]);
                                            setIsOpen(false);
                                        }}
                                        className="relative aspect-video rounded-lg overflow-hidden group bg-gray-800 hover:ring-2 hover:ring-blue-500 transition-all"
                                    >
                                        <img
                                            src={gif.media_formats.tinygif.url}
                                            alt={gif.content_description}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                    </button>
                                ))}
                            </div>

                            {loading && (
                                <div className="flex justify-center py-4">
                                    <Loader2 className="animate-spin text-blue-500" size={24} />
                                </div>
                            )}

                            {!loading && gifs.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                    <Sticker size={32} className="mb-2 opacity-50" />
                                    <p className="text-xs">GIF bulunamadı</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-2 bg-gray-850 border-t border-gray-800 flex justify-between items-center text-[10px] text-gray-500 px-3">
                            <span>Powered by Tenor</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
