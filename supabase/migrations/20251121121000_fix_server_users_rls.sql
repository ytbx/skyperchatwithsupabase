-- Fix server_users RLS policies

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Server members viewable by members" ON server_users;
DROP POLICY IF EXISTS "Users can join servers" ON server_users;

-- Create proper RLS policies
CREATE POLICY "Users can view server members" ON server_users 
  FOR SELECT 
  USING (true); -- Allow viewing all server memberships

CREATE POLICY "Users can join servers" ON server_users 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Server owners can manage members" ON server_users 
  FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM servers 
      WHERE servers.id = server_users.server_id 
      AND servers.owner_id = auth.uid()
    )
    OR auth.uid() = user_id -- Users can leave servers themselves
  );

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_server_users_server_id ON server_users(server_id);
CREATE INDEX IF NOT EXISTS idx_server_users_user_id ON server_users(user_id);
