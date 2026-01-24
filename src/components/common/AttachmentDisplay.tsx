import { Download, FileText, Image as ImageIcon } from 'lucide-react';
import { FileUploadService } from '@/services/FileUploadService';
import { useState } from 'react';
import { GifPlayer } from './GifPlayer';

interface AttachmentDisplayProps {
    fileUrl: string;
    fileName: string;
    fileType?: string | null;
    fileSize?: number | null;
}

export function AttachmentDisplay({ fileUrl, fileName, fileType, fileSize }: AttachmentDisplayProps) {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const isImage = fileType?.startsWith('image/');

    const handleDownload = () => {
        window.open(fileUrl, '_blank');
    };

    if (isImage) {
        return (
            <>
                <div className="mt-2 max-w-sm">
                    {fileType === 'image/gif' || fileName.toLowerCase().endsWith('.gif') ? (
                        <GifPlayer
                            src={fileUrl}
                            alt={fileName}
                            className="rounded-lg cursor-pointer hover:opacity-90 transition-opacity max-h-[300px]"
                            onClick={() => setLightboxOpen(true)}
                        />
                    ) : (
                        <img
                            src={fileUrl}
                            alt={fileName}
                            className="rounded-lg cursor-pointer hover:opacity-90 transition-opacity max-h-[300px] object-cover"
                            onClick={() => setLightboxOpen(true)}
                        />
                    )}
                    <div className="flex items-center justify-between mt-1 text-xs text-gray-400">
                        <span className="truncate">{fileName}</span>
                        <button
                            onClick={handleDownload}
                            className="ml-2 hover:text-primary-500 transition-colors"
                        >
                            <Download className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                {/* Lightbox */}
                {lightboxOpen && (
                    <div
                        className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
                        onClick={() => setLightboxOpen(false)}
                    >
                        <img
                            src={fileUrl}
                            alt={fileName}
                            className="max-w-full max-h-full object-contain"
                        />
                    </div>
                )}
            </>
        );
    }

    // Non-image file
    return (
        <div className="mt-2 inline-flex items-center gap-3 bg-gray-700 rounded-lg p-3 border border-gray-600 hover:border-primary-500 transition-colors">
            <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center">
                <FileText className="w-5 h-5 text-gray-300" />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
                <div className="text-sm text-white truncate">{fileName}</div>
                {fileSize && (
                    <div className="text-xs text-gray-400">
                        {FileUploadService.formatFileSize(fileSize)}
                    </div>
                )}
            </div>
            <button
                onClick={handleDownload}
                className="p-2 hover:bg-gray-600 rounded transition-colors"
            >
                <Download className="w-4 h-4 text-gray-300" />
            </button>
        </div>
    );
}
