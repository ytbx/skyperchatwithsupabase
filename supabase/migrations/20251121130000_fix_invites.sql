-- Fix RLS for server_invites
DROP POLICY IF EXISTS "Invites are viewable by everyone" ON server_invites;
DROP POLICY IF EXISTS "Server members can create invites" ON server_invites;
DROP POLICY IF EXISTS "Server members can delete invites" ON server_invites;

CREATE POLICY "Invites are viewable by everyone" ON server_invites FOR SELECT USING (true);

CREATE POLICY "Server members can create invites" ON server_invites FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM server_users 
    WHERE server_id = server_invites.server_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Server members can delete invites" ON server_invites FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM server_users 
    WHERE server_id = server_invites.server_id 
    AND user_id = auth.uid()
  )
);

-- Update servers policy to allow reading server info for joining
DROP POLICY IF EXISTS "Servers viewable by everyone" ON servers;
CREATE POLICY "Servers viewable by everyone" ON servers FOR SELECT USING (true);
