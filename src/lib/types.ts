export interface Profile {
  id: string;
  username: string | null;
  email: string | null;
  profile_image_url: string | null;
  created_at: string;
  custom_status?: string | null;
  custom_emoji?: string | null;
  status?: 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';
  last_seen?: string;
}

export interface UserPresence {
  user_id: string;
  online_at: string;
  status: 'online' | 'offline';
}

export interface Server {
  id: string;
  name: string;
  server_image_url: string | null;
  is_public: boolean;
  owner_id: string;
  invite_code: string | null;
  created_at: string;
  description?: string | null;
}

export interface Channel {
  id: number;
  name: string;
  is_voice: boolean;
  is_owner_only: boolean;
  server_id: string;
  is_private: boolean;
}

export interface ChannelMessage {
  id: number;
  message: string;
  created_at?: string;
  sent_at?: string;
  sender_id: string;
  channel_id: number;
  is_image: boolean;
  sender?: Profile;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  edited_at?: string | null;
  reply_to_id?: number | null;
}

export interface Chat {
  id: number;
  message: string;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  is_image: boolean;
  is_read: boolean;
  sender?: Profile;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
}

export interface DirectMessage {
  id: string;
  message: string;
  sender_id: string;
  receiver_id: string;
  created_at: string;
  is_image: boolean;
  is_read: boolean;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
}

export interface Friend {
  id: string;
  requester_id: string;
  requested_id: string;
  status: 'accepted' | 'declined';
  created_at: string;
}

export interface FriendRequest {
  id: string;
  requester_id: string;
  requested_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  requester?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'message' | 'friend_request' | 'call' | 'server_invite';
  title: string;
  message: string;
  created_at: string;
  metadata?: {
    sender_id?: string;
    sender_name?: string;
    call_type?: 'voice' | 'video';
    server_id?: string;
  };
}

export interface WebRTCSignal {
  id: number;
  kind: string;
  from_id: string;
  to_id: string;
  payload: any;
  created_at: string;
  delivered: boolean;
}



export const PERMISSIONS = {
  ADMINISTRATOR: 1n << 0n,    // (1) Bypass all checks
  MANAGE_SERVER: 1n << 1n,    // (2) Edit server settings
  MANAGE_ROLES: 1n << 2n,     // (4) Create/Edit/Delete roles
  MANAGE_CHANNELS: 1n << 3n,  // (8) Create/Edit/Delete channels
  KICK_MEMBERS: 1n << 4n,     // (16) Kick lower-ranked members
  BAN_MEMBERS: 1n << 5n,      // (32) Ban lower-ranked members
  CREATE_INVITE: 1n << 6n,    // (64) Create invites
  VIEW_CHANNEL: 1n << 7n,     // (128) See channel
  SEND_MESSAGES: 1n << 8n,    // (256) Send messages
};

export interface ServerRole {
  id: number;
  server_id: string;
  name: string;
  color: string;
  position: number;
  permissions: string; // BigInt sent as string from Supabase
  is_hoisted: boolean;
  created_at: string;
}

export interface ChannelPermission {
  id: number;
  channel_id: number;
  role_id: number | null;
  user_id: string | null;
  allow: string; // BigInt string
  deny: string; // BigInt string
}

export type UserStatus = 'online' | 'away' | 'busy' | 'offline';

export interface OnlineUser {
  userId: string;
  status: UserStatus;
  lastSeen?: string;
}

export interface VoiceChannelMember {
  id: number;
  channel_id: number;
  user_id: string;
  joined_at: string;
  is_muted: boolean;
  is_deafened: boolean;
  is_video_enabled: boolean;
  is_screen_sharing: boolean;
  profile?: Profile;
}

export interface ServerInvite {
  id: number;
  server_id: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  is_active: boolean;
}

// ScreenShareView component interfaces
export interface ScreenShareParticipant {
  id: string;
  name: string;
  stream: MediaStream;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isMainStream?: boolean;
  avatar?: string;
  isActiveSpeaker?: boolean;
  isMuted?: boolean;
  userId: string;
}

export interface ScreenShareViewProps {
  mainStream?: MediaStream | null;
  participants?: ScreenShareParticipant[];
  isMicMuted?: boolean;
  isCameraMuted?: boolean;
  isScreenSharing?: boolean;
  onMicToggle?: () => void;
  onCameraToggle?: () => void;
  onScreenShareToggle?: () => void;
  onLeave?: () => void;
  className?: string;
  showControls?: boolean;
  activeSpeaker?: string | null;
}

export interface DirectCall {
  id: string;
  caller_id: string;
  callee_id: string;
  status: 'ringing' | 'active' | 'ended' | 'rejected' | 'missed';
  call_type: 'voice' | 'video';
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface CallSignal {
  id: number;
  call_id: string;
  from_user_id: string;
  to_user_id: string;
  signal_type: 'offer' | 'answer' | 'ice-candidate' | 'call-ended' | 'call-rejected' | 'call-cancelled' | 'screen-share-started' | 'screen-share-stopped';
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit | Record<string, never>;
  created_at: string;
}
