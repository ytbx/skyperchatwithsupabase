-- Add last_seen column to profiles table for tracking when user was last online
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON profiles(last_seen);

-- Function to update last_seen timestamp
CREATE OR REPLACE FUNCTION update_user_last_seen(user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET last_seen = NOW()
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_user_last_seen(UUID) TO authenticated;
