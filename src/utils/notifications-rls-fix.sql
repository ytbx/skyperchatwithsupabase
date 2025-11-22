-- Fix Notifications RLS Policies and Enable Realtime
-- This file contains the necessary RLS policies for notifications to work properly

-- Enable RLS on notifications table (if not already enabled)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can manage their notifications" ON notifications;
DROP POLICY IF EXISTS "Users can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can read their notifications in realtime" ON notifications;

-- Allow users to create notifications for others
CREATE POLICY "Users can create notifications" ON notifications
    FOR INSERT WITH CHECK (true);

-- Allow users to read their own notifications
CREATE POLICY "Users can read their notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

-- Allow users to update their own notifications (mark as read)
CREATE POLICY "Users can update their notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Allow users to delete their own notifications
CREATE POLICY "Users can delete their notifications" ON notifications
    FOR DELETE USING (auth.uid() = user_id);

-- Enable RLS on channel_messages table (if not already enabled)
ALTER TABLE channel_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Channel members can read messages" ON channel_messages;
DROP POLICY IF EXISTS "Users can create channel messages" ON channel_messages;
DROP POLICY IF EXISTS "Channel members can read messages in realtime" ON channel_messages;

-- Allow users to create messages in channels they are members of
CREATE POLICY "Users can create messages in their channels" ON channel_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM server_users su, channels c
            WHERE c.id = channel_messages.channel_id
            AND su.server_id = c.server_id
            AND su.user_id = auth.uid()
        )
    );

-- Allow channel members to read messages
CREATE POLICY "Channel members can read messages" ON channel_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM server_users su, channels c
            WHERE c.id = channel_messages.channel_id
            AND su.server_id = c.server_id
            AND su.user_id = auth.uid()
        )
    );

-- Allow users to update their own messages
CREATE POLICY "Users can update their own messages" ON channel_messages
    FOR UPDATE USING (auth.uid() = sender_id);

-- Allow users to delete their own messages
CREATE POLICY "Users can delete their own messages" ON channel_messages
    FOR DELETE USING (auth.uid() = sender_id);

-- Enable RLS on chats table (direct messages) (if not already enabled)
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read their direct messages" ON chats;
DROP POLICY IF EXISTS "Users can send direct messages" ON chats;
DROP POLICY IF EXISTS "Users can read their direct messages in realtime" ON chats;

-- Allow users to create direct messages
CREATE POLICY "Users can send direct messages" ON chats
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Allow users to read direct messages they're involved in
CREATE POLICY "Users can read their direct messages" ON chats
    FOR SELECT USING (
        auth.uid() = sender_id OR auth.uid() = receiver_id
    );

-- Allow users to update their own direct messages (for marking as read)
CREATE POLICY "Users can update their received messages" ON chats
    FOR UPDATE USING (auth.uid() = receiver_id);

-- Allow users to delete their own direct messages
CREATE POLICY "Users can delete their direct messages" ON chats
    FOR DELETE USING (auth.uid() = sender_id);

-- Grant necessary permissions
GRANT ALL ON notifications TO authenticated;
GRANT ALL ON channel_messages TO authenticated;
GRANT ALL ON chats TO authenticated;

-- Create indexes for better performance (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_channel_messages_channel_id ON channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_messages_sender_id ON channel_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chats_sender_id ON chats(sender_id);
CREATE INDEX IF NOT EXISTS idx_chats_receiver_id ON chats(receiver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- Comments for documentation
COMMENT ON TABLE notifications IS 'User notifications table for in-app notifications';
COMMENT ON TABLE channel_messages IS 'Messages in channels for group chat';
COMMENT ON TABLE chats IS 'Direct messages between users';

-- Note: After running this SQL, you also need to enable realtime for these tables in Supabase Dashboard:
-- 1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT_ID/realtime
-- 2. Enable realtime for: channel_messages, chats, notifications
-- 3. Make sure the policies allow authenticated users to read the data
