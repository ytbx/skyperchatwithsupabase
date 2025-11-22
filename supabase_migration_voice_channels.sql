-- Migration: Update webrtc_signals for voice channels
-- 1. Make call_id nullable (since channel signals won't have a direct_call id)
-- 2. Add channel_id column

ALTER TABLE webrtc_signals
ALTER COLUMN call_id DROP NOT NULL;

ALTER TABLE webrtc_signals
ADD COLUMN IF NOT EXISTS channel_id BIGINT REFERENCES channels(id) ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_channel_id ON webrtc_signals(channel_id);
