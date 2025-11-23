-- Add file attachment support to chats table
-- This brings chats table in line with channel_messages which already has these fields

ALTER TABLE chats 
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_type TEXT,
ADD COLUMN IF NOT EXISTS file_size BIGINT;
