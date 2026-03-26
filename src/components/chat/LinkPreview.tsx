import React, { useEffect, useState } from 'react';
import { fetchLinkMetadata, LinkMetadata } from '../../services/linkPreviewService';

interface LinkPreviewProps {
    url: string;
    onLoad?: () => void;
}

export const LinkPreview: React.FC<LinkPreviewProps> = ({ url, onLoad }) => {
    const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const loadMetadata = async () => {
            setLoading(true);
            const data = await fetchLinkMetadata(url);
            if (isMounted) {
                setMetadata(data);
                setLoading(false);
                if (onLoad) onLoad();
            }
        };

        loadMetadata();
        return () => {
            isMounted = false;
        };
    }, [url]);

    if (loading) {
        return (
            <div className="mt-2 p-3 bg-[#2b2d31] rounded-lg border border-[#3f4147] animate-pulse w-full max-w-[432px]">
                <div className="h-4 bg-[#3f4147] rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-[#3f4147] rounded w-full mb-1"></div>
                <div className="h-3 bg-[#3f4147] rounded w-1/2"></div>
            </div>
        );
    }

    if (!metadata || (!metadata.title && !metadata.description)) {
        console.log('[LinkPreview] No metadata found for:', url);
        return (
            <div className="mt-1 text-[11px] text-[#949ba4] italic">
                Önizleme yüklenemedi: {url.substring(0, 30)}...
            </div>
        );
    }

    const getHostname = (url: string) => {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return '';
        }
    };

    const getLinkStyles = (url: string) => {
        try {
            const hostname = new URL(url).hostname.toLowerCase();
            if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
                return { color: '#ff0000', label: 'YouTube' };
            }
            if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
                return { color: '#1DA1F2', label: 'Twitter' };
            }
            if (hostname.includes('instagram.com')) {
                return { color: '#E1306C', label: 'Instagram' };
            }
        } catch (e) { }
        return { color: '#00a8fc', label: 'Link' };
    };

    const isMediaLink = (url: string) => {
        const mediaExtensions = /\.(jpg|jpeg|png|webp|gif|svg|mp4|webm|mov)$/i;
        const isDirectMedia = mediaExtensions.test(url.split('?')[0]);
        const isGiphy = url.includes('giphy.com/gifs/');
        const isTenor = url.includes('tenor.com/view/') || url.includes('media.tenor.com');
        return isDirectMedia || isGiphy || isTenor;
    };

    const { color } = getLinkStyles(url);
    const simplified = isMediaLink(url);
    const hostname = getHostname(url);
    const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;

    return (
        <div 
            className="mt-2 max-w-[432px] overflow-hidden rounded-[4px] bg-[#2b2d31] hover:bg-[#2e3035] transition-colors group cursor-pointer flex flex-col pt-3 pb-2 px-3 relative"
            style={{ borderLeft: `4px solid ${color}` }}
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
        >

            {/* Content Area - Hidden for simplified media links */}
            {!simplified && (
                <div className="flex flex-col gap-1 mb-2">
                    {metadata.siteName && (
                        <div className="text-[12px] text-[#dbdee1] font-medium leading-[16px] truncate">
                            {metadata.siteName}
                        </div>
                    )}

                    <div 
                        className="text-[14px] font-bold hover:underline leading-[18px] mb-0.5"
                        style={{ color: color }}
                    >
                        {metadata.title}
                    </div>

                    {metadata.description && (
                        <div className="text-[13px] text-[#dbdee1] leading-[18px] whitespace-pre-wrap">
                            {metadata.description}
                        </div>
                    )}
                </div>
            )}

            {/* Large Image */}
            {metadata.image && (
                <div className={`mt-2 mb-2 rounded-[4px] overflow-hidden border border-[#1e1f22] bg-[#1e1f22] relative group-hover:border-[#232428] transition-colors ${simplified ? 'mt-0' : ''}`}>
                    <img
                        src={metadata.image}
                        alt={metadata.title || 'Link preview'}
                        className="max-h-[300px] w-full object-cover"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                </div>
            )}

            {/* Footer - Only show for non-simplified or if it's a platform we care about */}
            {!simplified && (
                <div className="flex items-center gap-2 mt-1">
                    <img
                        src={faviconUrl}
                        alt=""
                        className="w-4 h-4 rounded-sm"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                    <div className="text-[11px] text-[#dbdee1] font-medium flex items-center gap-1">
                        <span>{metadata.siteName || hostname}</span>
                        <span className="text-[#949ba4] font-normal">•</span>
                        <span className="text-[#949ba4] font-normal">bağlantı</span>
                    </div>
                </div>
            )}
        </div>
    );
};
