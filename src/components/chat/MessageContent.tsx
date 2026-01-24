import React from 'react';
import { LinkPreview } from './LinkPreview';

interface MessageContentProps {
    content: string;
}

export const MessageContent: React.FC<MessageContentProps> = ({ content }) => {
    // Regular expression to detect URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    // Split content by URLs and map through them
    const parts = content.split(urlRegex);

    // Find unique URLs for previews
    const urls = Array.from(new Set(content.match(urlRegex) || []));

    return (
        <div className="flex flex-col">
            <div className="whitespace-pre-wrap break-words text-[15px] leading-[1.375rem]">
                {parts.map((part, index) => {
                    if (part.match(urlRegex)) {
                        return (
                            <a
                                key={index}
                                href={part}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#00a8fc] hover:underline transition-colors"
                            >
                                {part}
                            </a>
                        );
                    }
                    return <span key={index} className="text-[#dbdee1]">{part}</span>;
                })}
            </div>

            {urls.length > 0 && (
                <div className="flex flex-col gap-1">
                    {urls.map((url, index) => (
                        <LinkPreview key={`${url}-${index}`} url={url} />
                    ))}
                </div>
            )}
        </div>
    );
};
