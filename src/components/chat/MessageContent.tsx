import React from 'react';

interface MessageContentProps {
    content: string;
}

export const MessageContent: React.FC<MessageContentProps> = ({ content }) => {
    // Regular expression to detect URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    // Split content by URLs and map through them
    const parts = content.split(urlRegex);

    return (
        <>
            {parts.map((part, index) => {
                if (part.match(urlRegex)) {
                    return (
                        <a
                            key={index}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                        >
                            {part}
                        </a>
                    );
                }
                return <span key={index}>{part}</span>;
            })}
        </>
    );
};
