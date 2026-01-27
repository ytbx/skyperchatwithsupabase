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
        <div className="mt-2 max-w-[520px] overflow-hidden rounded-md bg-[#2b2d31] border-l-4 border-l-[#00a8fc] hover:bg-[#2e3035] transition-colors group cursor-pointer shadow-lg"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
            <div className="p-4">
                <div className="min-w-0">
                    <div className="text-[14px] text-white font-bold mb-1 truncate">
                        {metadata.title || metadata.siteName}
                    </div>

                    {metadata.description && (
                        <div className="text-[14px] text-[#dbdee1] line-clamp-4 leading-normal mb-3">
                            {metadata.description}
                        </div>
                    )}
                </div>

                {metadata.image && (
                    <div className="mt-3 rounded-lg overflow-hidden bg-[#1e1f22] border border-[#3f4147]/50 max-h-[400px]">
                        <img
                            src={metadata.image}
                            alt={metadata.title || 'Link preview'}
                            className="w-full h-auto block max-h-[400px] object-cover"
                            onError={(e) => {
                                e.currentTarget.parentElement!.style.display = 'none';
                            }}
                        />
                    </div>
                )}

                <div className="mt-3 flex items-center gap-2 text-[#949ba4] text-[12px]">
                    {hostname.includes('twitter.com') || hostname.includes('x.com') ? (
                        <span className="font-medium">X</span>
                    ) : (
                        <span className="font-medium uppercase tracking-tight">{hostname}</span>
                    )}
                    <span>•</span>
                    <span>{new Date().toLocaleDateString('tr-TR')}</span>
                </div>
            </div>
        </div>
    );
};
