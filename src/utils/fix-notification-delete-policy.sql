-- Notifications RLS Policy Update
-- This ensures users can delete their own notifications

-- First, drop the existing delete policy
DROP POLICY IF EXISTS "Users can delete their notifications" ON notifications;

-- Recreate the delete policy with explicit permissions
CREATE POLICY "Users can delete their notifications" ON notifications
    FOR DELETE 
    USING (auth.uid() = user_id);

-- Verify the policy is active
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'notifications' AND cmd = 'DELETE';
