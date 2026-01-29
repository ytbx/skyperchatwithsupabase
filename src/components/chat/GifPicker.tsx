import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, Sticker, Star, X } from 'lucide-react';
import { gifService, TenorGif } from '../../services/GifService';

const FAVORITE_GIFS_KEY = 'ovox_favorite_gifs';

interface GifPickerProps {
    onGifSelect: (gifUrl: string, width?: number, height?: number) => void;
}

export const GifPicker: React.FC<GifPickerProps> = ({ onGifSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [gifs, setGifs] = useState<TenorGif[]>([]);
    const [loading, setLoading] = useState(false);
    const [nextPos, setNextPos] = useState<string | undefined>();
    const [favorites, setFavorites] = useState<TenorGif[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    // Debounce search
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Load favorites from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(FAVORITE_GIFS_KEY);
        if (stored) {
            try {
                setFavorites(JSON.parse(stored));
            } catch (e) {
                console.error('Error parsing favorite gifs', e);
            }
        }
    }, []);

    // Save favorites to localStorage
    useEffect(() => {
        localStorage.setItem(FAVORITE_GIFS_KEY, JSON.stringify(favorites));
    }, [favorites]);

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
        if (scrollHeight - scrollTop <= clientHeight + 150 && !loading && nextPos) {
            loadGifs(searchQuery, nextPos);
        }
    };

    const toggleFavorite = (gif: TenorGif, e: React.MouseEvent) => {
        e.stopPropagation();
        setFavorites(prev => {
            const isFav = prev.some(f => f.id === gif.id);
            if (isFav) {
                return prev.filter(f => f.id !== gif.id);
            } else {
                return [gif, ...prev];
            }
        });
    };

    const isFavorite = (id: string) => favorites.some(f => f.id === id);

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
                <div className="absolute bottom-full mb-3 right-0 w-[480px] bg-[#1e1f22] border border-[#2b2d31] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex flex-col h-[550px]">
                        {/* Header / Search */}
                        <div className="p-4 border-b border-[#2b2d31]">
                            <div className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-white transition-colors" size={16} />
                                <input
                                    type="text"
                                    placeholder="GIF Ara..."
                                    value={searchQuery}
                                    onChange={handleSearch}
                                    className="w-full bg-[#313338] text-white text-sm rounded-lg pl-11 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500 transition-all"
                                    autoFocus
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => { setSearchQuery(''); loadGifs(''); }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* GIF List Container */}
                        <div
                            className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar"
                            onScroll={handleScroll}
                        >
                            {/* Favorites Section */}
                            {!searchQuery && favorites.length > 0 && (
                                <div className="mb-6">
                                    <div className="flex items-center gap-2 mb-3 text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">
                                        <Star size={14} className="text-yellow-500 fill-yellow-500" />
                                        <span>Favoriler</span>
                                    </div>
                                    <div className="columns-2 gap-3 space-y-3">
                                        {favorites.map((gif) => (
                                            <div key={gif.id} className="relative break-inside-avoid">
                                                <button
                                                    onClick={() => {
                                                        onGifSelect(gif.media_formats.gif.url, gif.media_formats.gif.dims[0], gif.media_formats.gif.dims[1]);
                                                        setIsOpen(false);
                                                    }}
                                                    className="w-full rounded-xl overflow-hidden group bg-gray-800 hover:ring-2 hover:ring-blue-500 transition-all border border-[#2b2d31]"
                                                >
                                                    <img
                                                        src={gif.media_formats.tinygif.url}
                                                        alt={gif.content_description}
                                                        className="w-full h-auto object-cover"
                                                        loading="lazy"
                                                    />
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                                </button>
                                                <button
                                                    onClick={(e) => toggleFavorite(gif, e)}
                                                    className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-yellow-500 hover:scale-110 active:scale-95 transition-all opacity-100 backdrop-blur-sm"
                                                    title="Favorilerden Kaldır"
                                                >
                                                    <Star size={16} fill="currentColor" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="h-px bg-[#2b2d31] mt-6" />
                                </div>
                            )}

                            {/* Trending / Search Results */}
                            <div className="mb-2 pl-1">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    {searchQuery ? 'Arama Sonuçları' : 'Trendler'}
                                </span>
                            </div>

                            <div className="columns-2 gap-3 space-y-3 mt-3">
                                {gifs.map((gif) => (
                                    <div key={gif.id} className="relative group/item break-inside-avoid">
                                        <button
                                            onClick={() => {
                                                onGifSelect(gif.media_formats.gif.url, gif.media_formats.gif.dims[0], gif.media_formats.gif.dims[1]);
                                                setIsOpen(false);
                                            }}
                                            className="w-full rounded-xl overflow-hidden group bg-gray-800 hover:ring-2 hover:ring-blue-500 transition-all border border-[#2b2d31]"
                                        >
                                            <img
                                                src={gif.media_formats.tinygif.url}
                                                alt={gif.content_description}
                                                className="w-full h-auto block"
                                                loading="lazy"
                                            />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                        </button>
                                        <button
                                            onClick={(e) => toggleFavorite(gif, e)}
                                            className={`absolute top-2 right-2 p-1.5 bg-black/60 rounded-full backdrop-blur-sm transition-all hover:scale-110 active:scale-95 ${isFavorite(gif.id) ? 'text-yellow-500 opacity-100' : 'text-white opacity-0 group-hover/item:opacity-100 hover:text-yellow-500'}`}
                                        >
                                            <Star size={16} fill={isFavorite(gif.id) ? "currentColor" : "none"} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {loading && (
                                <div className="flex justify-center py-6">
                                    <Loader2 className="animate-spin text-blue-500" size={28} />
                                </div>
                            )}

                            {!loading && gifs.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                                    <Sticker size={48} className="mb-4 opacity-50" />
                                    <p className="text-sm">GIF bulunamadı</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-3 bg-[#232428] border-t border-[#2b2d31] flex justify-between items-center text-[10px] text-gray-500 px-4">
                            <span className="font-medium">Powered by Tenor</span>
                            <span className="opacity-50 italic">Ovox GIF</span>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #2b2d31;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #313338;
                }
                .break-inside-avoid {
                    break-inside: avoid;
                }
            `}</style>
        </div>
    );
};
