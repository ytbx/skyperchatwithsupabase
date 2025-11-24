-- Function to unban a member
CREATE OR REPLACE FUNCTION unban_server_member(
  p_server_id UUID,
  p_user_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_caller_id UUID;
  v_has_permission BOOLEAN;
  v_is_owner BOOLEAN;
BEGIN
  v_caller_id := auth.uid();

  -- Check if caller is owner
  SELECT (owner_id = v_caller_id) INTO v_is_owner
  FROM servers WHERE id = p_server_id;

  -- Check if caller has BAN_MEMBERS permission (bit 32 -> 1<<5)
  IF NOT v_is_owner THEN
    SELECT EXISTS (
      SELECT 1
      FROM server_user_roles sur
      JOIN server_roles sr ON sur.role_id = sr.id
      WHERE sur.server_id = p_server_id
      AND sur.user_id = v_caller_id
      AND (sr.permissions::bigint & 32) > 0 -- 32 is BAN_MEMBERS
    ) INTO v_has_permission;

    IF NOT v_has_permission THEN
      RAISE EXCEPTION 'Permission denied: You do not have permission to unban members.';
    END IF;
  END IF;

  -- Delete from bans
  DELETE FROM server_bans
  WHERE server_id = p_server_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
