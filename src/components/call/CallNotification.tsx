import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff, Video, X } from 'lucide-react';
import { useCall } from '@/contexts/CallContext';
import { useVoiceChannel } from '@/contexts/VoiceChannelContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';

export const CallNotification: React.FC = () => {
    const { user } = useAuth();
    const { activeCall, incomingCall, callStatus, acceptCall, rejectCall, endCall } = useCall();
    const { activeChannelId, leaveChannel } = useVoiceChannel();
    const [callerProfile, setCallerProfile] = useState<Profile | null>(null);

    // Determine which call to show
    // Priority: Incoming Call (new) > Active Call (if ringing)
    const callToShow = incomingCall || (callStatus === 'ringing_incoming' ? activeCall : null) || (callStatus === 'ringing_outgoing' ? activeCall : null);

    // Load caller profile for incoming calls
    useEffect(() => {
        if (callToShow && user) {
            // Determine who the other person is based on auth user ID
            const otherUserId = callToShow.caller_id === user.id ? callToShow.callee_id : callToShow.caller_id;
            loadProfile(otherUserId);
        } else if (!callToShow) {
            setCallerProfile(null);
        }
    }, [callToShow, user?.id]);

    const loadProfile = async (userId: string) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (data && !error) {
            setCallerProfile(data);
        }
    };

    const handleAcceptCall = async () => {
        if (!callToShow) return;

        // Leave voice channel if connected
        if (activeChannelId) {
            console.log('[CallNotification] Leaving voice channel before accepting call');
            await leaveChannel();
            // Give a small buffer for cleanup
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        await acceptCall(callToShow);
    };

    // Only show notification for ringing states or if we have a separate incoming call
    if (!callToShow && !incomingCall && callStatus !== 'ringing_incoming' && callStatus !== 'ringing_outgoing') {
        return null;
    }

    // Safety check
    if (!callToShow) return null;

    const isIncoming = !!incomingCall || callStatus === 'ringing_incoming';
    const isOutgoing = !incomingCall && callStatus === 'ringing_outgoing';

    // Friendly fallbacks in Turkish
    const fallbackName = isIncoming ? 'Birisi arıyor' : 'Aranıyor...';
    const displayName = callerProfile?.username || fallbackName;

    return (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-5">
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-4 min-w-[320px]">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        {callToShow.call_type === 'video' ? (
                            <Video size={20} className="text-blue-500" />
                        ) : (
                            <Phone size={20} className="text-green-500" />
                        )}
                        <span className="text-white font-medium">
                            {callToShow.call_type === 'video' ? 'Görüntülü Arama' : 'Sesli Arama'}
                        </span>
                    </div>
                </div>

                {/* Caller Info */}
                <div className="flex items-center space-x-4 mb-4">
                    {/* Avatar with pulse animation for incoming calls */}
                    <div className={`relative ${isIncoming ? 'animate-pulse' : ''}`}>
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center overflow-hidden border-2 border-gray-700">
                            {callerProfile?.profile_image_url ? (
                                <img
                                    src={callerProfile.profile_image_url}
                                    alt={displayName}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <span className="text-white text-xl font-bold">
                                    {displayName.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                        {isIncoming && (
                            <div className="absolute inset-0 rounded-full border-4 border-green-500 animate-ping" />
                        )}
                    </div>

                    {/* Name and Status */}
                    <div className="flex-1">
                        <h3 className="text-white font-semibold text-lg">
                            {displayName}
                        </h3>
                        <p className="text-gray-400 text-sm">
                            {isIncoming && (incomingCall ? 'Gelen arama (Meşgul)' : 'Gelen arama...')}
                            {isOutgoing && 'Aranıyor...'}
                        </p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2">
                    {isIncoming && (
                        <>
                            {/* Accept Button */}
                            <button
                                onClick={handleAcceptCall}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 font-medium"
                            >
                                <Phone size={18} />
                                <span>Kabul Et</span>
                            </button>

                            {/* Reject Button */}
                            <button
                                onClick={() => rejectCall(callToShow.id)}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 font-medium"
                            >
                                <PhoneOff size={18} />
                                <span>Reddet</span>
                            </button>
                        </>
                    )}

                    {isOutgoing && (
                        <>
                            {/* Cancel Button */}
                            <button
                                onClick={endCall}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 font-medium"
                            >
                                <X size={18} />
                                <span>İptal Et</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

