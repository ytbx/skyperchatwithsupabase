import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff, Video, X } from 'lucide-react';
import { useCall } from '@/contexts/CallContext';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';

export const CallNotification: React.FC = () => {
    const { activeCall, callStatus, acceptCall, rejectCall, endCall } = useCall();
    const [callerProfile, setCallerProfile] = useState<Profile | null>(null);

    // Load caller profile for incoming calls
    useEffect(() => {
        if (activeCall && callStatus === 'ringing_incoming') {
            loadCallerProfile();
        }
    }, [activeCall, callStatus]);

    const loadCallerProfile = async () => {
        if (!activeCall) return;

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', activeCall.caller_id)
            .single();

        if (data && !error) {
            setCallerProfile(data);
        }
    };

    // Don't show notification if no active call or call is already active
    if (!activeCall || callStatus === 'active' || callStatus === 'idle') {
        return null;
    }

    const isIncoming = callStatus === 'ringing_incoming';
    const isOutgoing = callStatus === 'ringing_outgoing';
    const displayName = isIncoming ? (callerProfile?.username || 'Unknown') : 'Calling...';

    return (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-5">
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-4 min-w-[320px]">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        {activeCall.call_type === 'video' ? (
                            <Video size={20} className="text-blue-500" />
                        ) : (
                            <Phone size={20} className="text-green-500" />
                        )}
                        <span className="text-white font-medium">
                            {activeCall.call_type === 'video' ? 'Video Call' : 'Voice Call'}
                        </span>
                    </div>
                </div>

                {/* Caller Info */}
                <div className="flex items-center space-x-4 mb-4">
                    {/* Avatar with pulse animation for incoming calls */}
                    <div className={`relative ${isIncoming ? 'animate-pulse' : ''}`}>
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                            <span className="text-white text-xl font-bold">
                                {displayName.charAt(0).toUpperCase()}
                            </span>
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
                            {isIncoming && 'Incoming call...'}
                            {isOutgoing && 'Calling...'}
                            {callStatus === 'connecting' && 'Connecting...'}
                        </p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2">
                    {isIncoming && (
                        <>
                            {/* Accept Button */}
                            <button
                                onClick={() => acceptCall(activeCall)}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 font-medium"
                            >
                                <Phone size={18} />
                                <span>Accept</span>
                            </button>

                            {/* Reject Button */}
                            <button
                                onClick={() => rejectCall(activeCall.id)}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 font-medium"
                            >
                                <PhoneOff size={18} />
                                <span>Reject</span>
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
                                <span>Cancel</span>
                            </button>
                        </>
                    )}

                    {callStatus === 'connecting' && (
                        <div className="flex-1 bg-gray-700 text-white py-3 px-4 rounded-lg flex items-center justify-center">
                            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                            <span>Connecting...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
