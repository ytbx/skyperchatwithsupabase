import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, LogOut, Check } from 'lucide-react';
import { Server } from '@/lib/types';

interface ServerContextMenuProps {
    x: number;
    y: number;
    server: Server;
    isNotificationsMuted: boolean;
    onClose: () => void;
    onToggleNotifications: (serverId: string) => void;
    onLeaveServer: (server: Server) => void;
}

export function ServerContextMenu({
    x,
    y,
    server,
    isNotificationsMuted,
    onClose,
    onToggleNotifications,
    onLeaveServer
}: ServerContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    useEffect(() => {
        function handleEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                if (showLeaveConfirm) {
                    setShowLeaveConfirm(false);
                } else {
                    onClose();
                }
            }
        }
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose, showLeaveConfirm]);

    // Adjust position to not go off screen
    const adjustedPosition = {
        top: Math.min(y, window.innerHeight - (showLeaveConfirm ? 200 : 150)),
        left: Math.min(x, window.innerWidth - 220)
    };

    const handleLeaveClick = () => {
        setShowLeaveConfirm(true);
    };

    const handleConfirmLeave = () => {
        onLeaveServer(server);
        onClose();
    };

    return (
        <div
            ref={menuRef}
            className="fixed z-[100] w-52 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            style={adjustedPosition}
        >
            {/* Header with server name */}
            <div className="px-3 py-2 border-b border-gray-700/50 bg-gray-800/50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden">
                        {server.server_image_url ? (
                            <img src={server.server_image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-xs font-bold text-white">
                                {server.name?.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>
                    <span className="text-sm font-semibold text-white truncate">
                        {server.name}
                    </span>
                </div>
            </div>

            {!showLeaveConfirm ? (
                <div className="py-1">
                    {/* Notification Toggle */}
                    <button
                        onClick={() => {
                            onToggleNotifications(server.id);
                            onClose();
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white flex items-center justify-between transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            {isNotificationsMuted ? (
                                <BellOff size={16} className="text-red-400" />
                            ) : (
                                <Bell size={16} className="text-green-400" />
                            )}
                            <span>Bildirimleri Engelle</span>
                        </div>
                        {isNotificationsMuted && (
                            <Check size={16} className="text-green-400" />
                        )}
                    </button>

                    <div className="h-px bg-gray-700/50 my-1" />

                    {/* Leave Server */}
                    <button
                        onClick={handleLeaveClick}
                        className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2 transition-colors"
                    >
                        <LogOut size={16} />
                        Sunucudan Ayrıl
                    </button>
                </div>
            ) : (
                /* Leave Confirmation */
                <div className="p-3">
                    <p className="text-sm text-gray-300 mb-3">
                        <span className="font-semibold text-white">{server.name}</span> sunucusundan ayrılmak istediğinize emin misiniz?
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowLeaveConfirm(false)}
                            className="flex-1 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                        >
                            İptal
                        </button>
                        <button
                            onClick={handleConfirmLeave}
                            className="flex-1 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                        >
                            Ayrıl
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
