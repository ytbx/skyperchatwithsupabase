-- Missing Tables Migration

-- 1. User Activity Table
CREATE TABLE IF NOT EXISTS user_activity (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away', 'busy', 'idle', 'dnd', 'invisible')),
  custom_status TEXT,
  custom_status_emoji TEXT,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  heartbeat TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Call Requests Table
CREATE TABLE IF NOT EXISTS call_requests (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  from_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  call_type TEXT CHECK (call_type IN ('voice', 'video')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Friend Requests Table (separate from friendships)
CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  requested_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, requested_id)
);

-- 4. Friends Table (accepted friendships)
CREATE TABLE IF NOT EXISTS friends (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  requested_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'accepted' CHECK (status IN ('accepted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, requested_id)
);

-- Enable RLS
ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_activity
CREATE POLICY "Users can view all user activity" ON user_activity FOR SELECT USING (true);
CREATE POLICY "Users can update own activity" ON user_activity FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own activity status" ON user_activity FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for call_requests
CREATE POLICY "Users can view their call requests" ON call_requests FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
CREATE POLICY "Users can create call requests" ON call_requests FOR INSERT WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "Users can update call requests" ON call_requests FOR UPDATE USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- RLS Policies for friend_requests
CREATE POLICY "Users can view their friend requests" ON friend_requests FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = requested_id);
CREATE POLICY "Users can create friend requests" ON friend_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Users can update friend requests" ON friend_requests FOR UPDATE USING (auth.uid() = requester_id OR auth.uid() = requested_id);

-- RLS Policies for friends
CREATE POLICY "Users can view their friends" ON friends FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = requested_id);
CREATE POLICY "Users can insert friends" ON friends FOR INSERT WITH CHECK (auth.uid() = requester_id OR auth.uid() = requested_id);

-- Add to Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE user_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE call_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE friends;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_status ON user_activity(status);
CREATE INDEX IF NOT EXISTS idx_call_requests_from_user ON call_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_call_requests_to_user ON call_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_call_requests_status ON call_requests(status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_requester ON friend_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_requested ON friend_requests(requested_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON friend_requests(status);
CREATE INDEX IF NOT EXISTS idx_friends_requester ON friends(requester_id);
CREATE INDEX IF NOT EXISTS idx_friends_requested ON friends(requested_id);
