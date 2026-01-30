import React, { useState, useEffect, useRef } from 'react';
import { X, Folder, MoreVertical, LogOut, Check } from 'lucide-react';
import { Server } from '@/lib/types';
import { toast } from 'sonner';

interface ServerFolderPopupProps {
    x: number;
    y: number;
    folderId: string;
    folderName: string;
    servers: Server[];
    selectedServerId: string | null;
    onSelectServer: (serverId: string) => void;
    onClose: () => void;
    onRename?: (newName: string) => void;
    onRemoveFromServer?: (serverId: string) => void;
    onContextMenu?: (e: React.MouseEvent, server: Server) => void;
}

export const ServerFolderPopup: React.FC<ServerFolderPopupProps> = ({
    x,
    y,
    folderId,
    folderName,
    servers,
    selectedServerId,
    onSelectServer,
    onClose,
    onRename,
    onContextMenu
}) => {
    const popupRef = useRef<HTMLDivElement>(null);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState(folderName);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Handle escape key
    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const handleNameSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editedName.trim() && onRename) {
            onRename(editedName.trim());
            setIsEditingName(false);
        }
    };

    return (
        <div
            ref={popupRef}
            className="fixed z-[110] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-4 min-w-[200px] animate-in fade-in zoom-in duration-200"
            style={{
                left: x + 16,
                top: Math.min(y, window.innerHeight - 300),
                maxWidth: '300px'
            }}
        >
            <div className="flex items-center justify-between mb-4 px-1">
                {isEditingName ? (
                    <form onSubmit={handleNameSubmit} className="flex-1 mr-2">
                        <input
                            autoFocus
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            onBlur={() => setIsEditingName(false)}
                            className="w-full bg-gray-800 border border-blue-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
                        />
                    </form>
                ) : (
                    <h3
                        className="text-gray-200 font-bold text-sm truncate cursor-pointer hover:text-white"
                        onDoubleClick={() => setIsEditingName(true)}
                    >
                        {folderName}
                    </h3>
                )}
                <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                    <X size={16} />
                </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
                {servers.map((server) => (
                    <button
                        key={server.id}
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('sourceServerId', server.id);
                            e.dataTransfer.setData('sourceFolderId', folderId);
                            e.dataTransfer.effectAllowed = 'move';
                        }}
                        onClick={() => {
                            onSelectServer(server.id);
                            onClose();
                        }}
                        onContextMenu={(e) => onContextMenu && onContextMenu(e, server)}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 hover:rounded-lg overflow-hidden group relative ${selectedServerId === server.id ? 'bg-primary-500 rounded-lg shadow-glow-sm' : 'bg-gray-800 hover:bg-gray-700'
                            }`}
                        title={server.name}
                    >
                        {server.server_image_url ? (
                            <img src={server.server_image_url} alt={server.name} className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-lg font-bold text-white">
                                {server.name.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            <div className="mt-4 pt-2 border-t border-gray-800">
                <p className="text-[10px] text-gray-500 text-center italic">
                    Sunucuları çıkarmak için sürükle bırak yapabilirsiniz.
                </p>
            </div>
        </div>
    );
};
