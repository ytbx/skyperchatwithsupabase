import { X } from 'lucide-react';
import { FileUploadService } from '@/services/FileUploadService';

interface FilePreviewProps {
    file: File;
    onRemove: () => void;
}

export function FilePreview({ file, onRemove }: FilePreviewProps) {
    const isImage = FileUploadService.isImage(file);
    const previewUrl = isImage ? URL.createObjectURL(file) : null;

    return (
        <div className="relative inline-block bg-gray-700 rounded-lg p-2 border border-gray-600">
            <button
                onClick={onRemove}
                className="absolute -top-2 -right-2 bg-error rounded-full p-1 hover:bg-error/80 transition-colors"
            >
                <X className="w-3 h-3 text-white" />
            </button>

            {isImage && previewUrl ? (
                <div className="flex flex-col gap-2">
                    <img
                        src={previewUrl}
                        alt={file.name}
                        className="max-w-[200px] max-h-[200px] rounded object-cover"
                    />
                    <div className="text-xs text-gray-400 truncate max-w-[200px]">
                        {file.name}
                    </div>
                    <div className="text-xs text-gray-500">
                        {FileUploadService.formatFileSize(file.size)}
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-3 p-2">
                    <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center">
                        <span className="text-xs font-bold text-gray-300">
                            {file.name.split('.').pop()?.toUpperCase()}
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <div className="text-sm text-white truncate max-w-[150px]">
                            {file.name}
                        </div>
                        <div className="text-xs text-gray-500">
                            {FileUploadService.formatFileSize(file.size)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
