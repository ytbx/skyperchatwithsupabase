-- Fix servers table RLS policies

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Server owners can update" ON servers;
DROP POLICY IF EXISTS "Server owners can delete" ON servers;
DROP POLICY IF EXISTS "Users can view servers they are members of" ON servers;
DROP POLICY IF EXISTS "Users can create servers" ON servers;

-- Create proper RLS policies
CREATE POLICY "Anyone can view servers" ON servers 
  FOR SELECT 
  USING (true);

CREATE POLICY "Users can create servers" ON servers 
  FOR INSERT 
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Server owners can update their servers" ON servers 
  FOR UPDATE 
  USING (auth.uid() = owner_id);

CREATE POLICY "Server owners can delete their servers" ON servers 
  FOR DELETE 
  USING (auth.uid() = owner_id);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_servers_owner_id ON servers(owner_id);
