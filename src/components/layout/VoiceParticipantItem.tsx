import React from 'react';
import { MicOff, Headphones } from 'lucide-react';
import { useVoiceActivity } from '@/hooks/useVoiceActivity';
import { VoiceChannelMember } from '@/lib/types';

interface VoiceParticipantItemProps {
    participant: VoiceChannelMember;
    activeParticipantStream?: MediaStream;
    isCurrentUser: boolean;
    isActiveChannel: boolean;
    canMove: boolean;
    onDragStart: (e: React.DragEvent, userId: string, channelId: number) => void;
    channelId: number;
}

export function VoiceParticipantItem({
    participant,
    activeParticipantStream,
    isCurrentUser,
    isActiveChannel,
    canMove,
    onDragStart,
    channelId
}: VoiceParticipantItemProps) {
    const isSpeaking = useVoiceActivity(activeParticipantStream);

    return (
        <div
            className={`ml-8 mr-2 py-1 flex items-center gap-2 group rounded px-1 ${canMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} hover:bg-gray-800/50`}
            draggable={canMove}
            onDragStart={(e) => onDragStart(e, participant.user_id, channelId)}
        >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center overflow-hidden transition-all ${isSpeaking
                    ? 'bg-green-500 ring-2 ring-green-500/50 shadow-lg shadow-green-500/30'
                    : 'bg-gray-700'
                }`}>
                {participant.profile?.profile_image_url ? (
                    <img src={participant.profile.profile_image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                    <span className="text-xs text-white">
                        {participant.profile?.username?.charAt(0).toUpperCase()}
                    </span>
                )}
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-between">
                <span className={`text-sm truncate ${isActiveChannel && isCurrentUser ? 'text-green-400' : 'text-gray-400'}`}>
                    {participant.profile?.username}
                </span>
                <div className="flex items-center gap-1">
                    {participant.is_muted && <MicOff className="w-3 h-3 text-red-500" />}
                    {participant.is_deafened && <Headphones className="w-3 h-3 text-red-500" />}
                </div>
            </div>
        </div>
    );
}
