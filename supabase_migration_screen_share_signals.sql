-- Migration: Add screen sharing signal types to webrtc_signals table
-- This allows 'screen-share-started' and 'screen-share-stopped' signal types

-- Drop the existing check constraint
ALTER TABLE webrtc_signals 
DROP CONSTRAINT IF EXISTS webrtc_signals_signal_type_check;

-- Add the updated check constraint with new signal types
ALTER TABLE webrtc_signals 
ADD CONSTRAINT webrtc_signals_signal_type_check 
CHECK (signal_type IN (
  'offer', 
  'answer', 
  'ice-candidate', 
  'call-ended', 
  'call-rejected', 
  'call-cancelled',
  'screen-share-started',
  'screen-share-stopped'
));
