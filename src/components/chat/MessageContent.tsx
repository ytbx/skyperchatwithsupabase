import React from 'react';
import { LinkPreview } from './LinkPreview';

interface MessageContentProps {
    content: string;
    onLoad?: () => void;
}

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
    } catch (e) {
        // Fallback for invalid URLs
    }
    return { color: '#00a8fc', label: 'Link' };
};

const isMediaLink = (url: string) => {
    const mediaExtensions = /\.(jpg|jpeg|png|webp|gif|svg|mp4|webm|mov)$/i;
    const isDirectMedia = mediaExtensions.test(url.split('?')[0]);
    const isGiphy = url.includes('giphy.com/gifs/');
    const isTenor = url.includes('tenor.com/view/') || url.includes('media.tenor.com');
    return isDirectMedia || isGiphy || isTenor;
};

export const MessageContent: React.FC<MessageContentProps> = ({ content, onLoad }) => {
    // Regular expression to detect URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    // Split content by URLs and map through them
    const parts = content.split(urlRegex);

    // Find unique URLs for previews
    const urls = Array.from(new Set(content.match(urlRegex) || []));

    return (
        <div className="flex flex-col min-w-0">
            <div className="whitespace-pre-wrap break-words break-all text-[15px] leading-[1.375rem]">
                {parts.map((part, index) => {
                    const isUrl = part.match(urlRegex);
                    if (isUrl) {
                        const url = part;
                        // If it's a media link, we don't render the text link
                        if (isMediaLink(url)) {
                            return null;
                        }

                        const { color } = getLinkStyles(url);
                        return (
                            <a
                                key={index}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline transition-colors"
                                style={{ color }}
                            >
                                {url.length > 100 ? `${url.substring(0, 100)}...` : url}
                            </a>
                        );
                    }
                    return <span key={index} className="text-[#dbdee1]">{part}</span>;
                })}
            </div>

            {urls.length > 0 && (
                <div className="flex flex-col gap-1 mt-1">
                    {urls.slice(0, 3).map((url, index) => (
                        <LinkPreview key={`${url}-${index}`} url={url} onLoad={onLoad} />
                    ))}
                    {urls.length > 3 && (
                        <div className="text-xs text-gray-500 italic pl-1">
                            + {urls.length - 3} bağlantı daha...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
