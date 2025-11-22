-- Fix WebRTC signaling RLS policies
-- Created to fix 400/409 errors in console logs

-- Enable RLS on webrtc_signals table
ALTER TABLE webrtc_signals ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to send signals to specific users
CREATE POLICY "Users can send WebRTC signals to specific users" ON webrtc_signals
    FOR INSERT WITH CHECK (
        auth.uid() = from_user_id OR 
        auth.uid() = to_user_id
    );

-- Allow users to read signals meant for them
CREATE POLICY "Users can read their WebRTC signals" ON webrtc_signals
    FOR SELECT USING (
        auth.uid() = from_user_id OR 
        auth.uid() = to_user_id
    );

-- Allow users to delete their own signals
CREATE POLICY "Users can delete their WebRTC signals" ON webrtc_signals
    FOR DELETE USING (
        auth.uid() = from_user_id OR 
        auth.uid() = to_user_id
    );

-- Enable RLS on user_activity table
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own activity status
CREATE POLICY "Users can manage their own activity" ON user_activity
    FOR ALL USING (auth.uid() = user_id);

-- Allow users to view other users' activity for voice channel management
CREATE POLICY "Users can view other users' activity" ON user_activity
    FOR SELECT USING (true);

-- Enable RLS on server_user_roles table
ALTER TABLE server_user_roles ENABLE ROW LEVEL SECURITY;

-- Allow users to view server roles
CREATE POLICY "Server members can view roles" ON server_user_roles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM server_users 
            WHERE server_user_roles.server_id = server_users.server_id 
            AND server_users.user_id = auth.uid()
        )
    );

-- Allow server admins to manage roles
CREATE POLICY "Server admins can manage roles" ON server_user_roles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM server_users 
            WHERE server_user_roles.server_id = server_users.server_id 
            AND server_users.user_id = auth.uid()
            AND server_users.role_id IN (
                SELECT id FROM server_roles 
                WHERE server_roles.permissions::text LIKE '%"admin"%'
            )
        )
    );

-- Enable RLS on call_requests table
ALTER TABLE call_requests ENABLE ROW LEVEL SECURITY;

-- Allow users to create call requests
CREATE POLICY "Users can create call requests" ON call_requests
    FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- Allow users to view call requests involving them
CREATE POLICY "Users can view their call requests" ON call_requests
    FOR SELECT USING (
        auth.uid() = from_user_id OR 
        auth.uid() = to_user_id
    );

-- Allow users to update call requests they received
CREATE POLICY "Users can update received call requests" ON call_requests
    FOR UPDATE USING (auth.uid() = to_user_id);

-- Allow users to delete their own call requests
CREATE POLICY "Users can delete their own call requests" ON call_requests
    FOR DELETE USING (auth.uid() = from_user_id);

-- Grant necessary permissions
GRANT ALL ON webrtc_signals TO authenticated;
GRANT ALL ON user_activity TO authenticated;
GRANT ALL ON server_user_roles TO authenticated;
GRANT ALL ON call_requests TO authenticated;