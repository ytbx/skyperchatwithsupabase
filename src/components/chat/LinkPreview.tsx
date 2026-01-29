import React, { useEffect, useState } from 'react';
import { fetchLinkMetadata, LinkMetadata } from '../../services/linkPreviewService';

interface LinkPreviewProps {
    url: string;
}

export const LinkPreview: React.FC<LinkPreviewProps> = ({ url }) => {
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

    const hostname = getHostname(url);
    const faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;

    return (
        <div className="mt-2 max-w-[432px] overflow-hidden rounded-[4px] bg-[#2b2d31] border-l-4 border-l-[#00a8fc] hover:bg-[#2e3035] transition-colors group cursor-pointer flex flex-col pt-3 pb-2 px-3 relative"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>

            {/* Content Area */}
            <div className="flex flex-col gap-1 mb-2">
                {metadata.siteName && (
                    <div className="text-[12px] text-[#dbdee1] font-medium leading-[16px] truncate">
                        {metadata.siteName}
                    </div>
                )}

                <div className="text-[14px] font-bold text-[#00a8fc] hover:underline leading-[18px] mb-0.5">
                    {metadata.title}
                </div>

                {metadata.description && (
                    <div className="text-[13px] text-[#dbdee1] leading-[18px] whitespace-pre-wrap">
                        {metadata.description}
                    </div>
                )}
            </div>

            {/* Large Image */}
            {metadata.image && (
                <div className="mt-2 mb-2 rounded-[4px] overflow-hidden border border-[#1e1f22] bg-[#1e1f22] relative group-hover:border-[#232428] transition-colors">
                    <img
                        src={metadata.image}
                        alt={metadata.title || 'Link preview'}
                        className="max-h-[300px] w-full object-cover"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                </div>
            )}

            {/* Footer */}
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
        </div>
    );
};
