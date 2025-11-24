import { useEffect, useRef } from 'react';
import { UserMinus, Ban, X } from 'lucide-react';
import { PERMISSIONS } from '@/lib/types';
import { hasPermission } from '@/utils/PermissionUtils';

interface UserContextMenuProps {
    x: number;
    y: number;
    targetMemberId: string;
    targetMemberName: string;
    currentUserPermissions: bigint;
    isOwner: boolean; // Is the current user the owner?
    onClose: () => void;
    onKick: (memberId: string, memberName: string) => void;
    onBan: (memberId: string, memberName: string) => void;
}

export function UserContextMenu({
    x,
    y,
    targetMemberId,
    targetMemberName,
    currentUserPermissions,
    isOwner,
    onClose,
    onKick,
    onBan
}: UserContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const canKick = isOwner || hasPermission(currentUserPermissions, PERMISSIONS.KICK_MEMBERS);
    const canBan = isOwner || hasPermission(currentUserPermissions, PERMISSIONS.BAN_MEMBERS);

    if (!canKick && !canBan) return null;

    // Adjust position to not go off screen
    const style = {
        top: y,
        left: x,
    };

    return (
        <div
            ref={menuRef}
            className="fixed z-50 w-48 bg-gray-900 border border-gray-800 rounded shadow-xl py-1 overflow-hidden"
            style={style}
        >
            <div className="px-3 py-2 border-b border-gray-800 mb-1">
                <span className="text-xs font-bold text-gray-400 uppercase truncate block">
                    {targetMemberName}
                </span>
            </div>

            {canKick && (
                <button
                    onClick={() => onKick(targetMemberId, targetMemberName)}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2 transition-colors"
                >
                    <UserMinus size={16} />
                    Sunucudan At
                </button>
            )}

            {canBan && (
                <button
                    onClick={() => onBan(targetMemberId, targetMemberName)}
                    className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 hover:text-red-400 flex items-center gap-2 transition-colors"
                >
                    <Ban size={16} />
                    Sunucudan Yasakla
                </button>
            )}
        </div>
    );
}
