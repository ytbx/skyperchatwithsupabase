-- Function to move a user to another voice channel
-- Only allows if the executor is the server owner or has MANAGE_CHANNELS permission

CREATE OR REPLACE FUNCTION move_voice_user(
  p_target_channel_id BIGINT,
  p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_server_id UUID;
  v_executor_id UUID;
  v_is_owner BOOLEAN;
  v_has_permission BOOLEAN;
  v_current_channel_id BIGINT;
BEGIN
  v_executor_id := auth.uid();

  -- Get server_id from the target channel
  SELECT server_id INTO v_server_id
  FROM channels
  WHERE id = p_target_channel_id;

  IF v_server_id IS NULL THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  -- Check if executor is server owner
  SELECT (owner_id = v_executor_id) INTO v_is_owner
  FROM servers
  WHERE id = v_server_id;

  IF v_is_owner THEN
    -- Owner can always move
    UPDATE voice_channel_users
    SET channel_id = p_target_channel_id
    WHERE user_id = p_target_user_id;
    RETURN;
  END IF;

  -- Check permissions
  -- ADMINISTRATOR = 1
  -- MANAGE_CHANNELS = 8
  
  SELECT EXISTS (
    SELECT 1
    FROM server_user_roles sur
    JOIN server_roles sr ON sur.role_id = sr.id
    WHERE sur.user_id = v_executor_id
      AND sur.server_id = v_server_id
      AND (
        (sr.permissions::bigint & 1) = 1 -- ADMINISTRATOR
        OR
        (sr.permissions::bigint & 8) = 8 -- MANAGE_CHANNELS
      )
  ) INTO v_has_permission;

  IF v_has_permission THEN
    UPDATE voice_channel_users
    SET channel_id = p_target_channel_id
    WHERE user_id = p_target_user_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Insufficient permissions';
END;
$$;
