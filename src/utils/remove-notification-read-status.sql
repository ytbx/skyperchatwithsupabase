-- Remove is_read column from notifications table
-- This migration removes the read/unread functionality from notifications
-- Users will now only be able to delete notifications instead of marking them as read

ALTER TABLE notifications
DROP COLUMN IF EXISTS is_read;
