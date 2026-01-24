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

    const hostname = new URL(url).hostname.replace('www.', '');

    return (
        <div className="mt-2 max-w-[432px] overflow-hidden rounded-md bg-[#2b2d31] border-l-4 border-l-[#4e5058] hover:bg-[#2e3035] transition-colors group cursor-pointer"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
            <div className="p-3 flex gap-3">
                <div className="flex-1 min-w-0">
                    {metadata.siteName && (
                        <div className="text-[12px] text-[#dbdee1] font-medium mb-1 truncate uppercase tracking-tight">
                            {metadata.siteName}
                        </div>
                    )}
                    <div className="text-[14px] font-semibold text-[#00a8fc] hover:underline mb-1 line-clamp-2">
                        {metadata.title}
                    </div>
                    {metadata.description && (
                        <div className="text-[13px] text-[#dbdee1] line-clamp-3 leading-tight">
                            {metadata.description}
                        </div>
                    )}
                </div>

                {metadata.image && (
                    <div className="flex-shrink-0 w-20 h-20 rounded overflow-hidden bg-[#1e1f22]">
                        <img
                            src={metadata.image}
                            alt={metadata.title || 'Link preview'}
                            className="w-full h-full object-cover"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
