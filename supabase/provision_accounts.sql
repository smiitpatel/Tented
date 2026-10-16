-- ===================================================================================
-- TENTED️: Account Provisioning Guide & Migration Seed
-- File: supabase/provision_accounts.sql
-- ===================================================================================

-- Step 1: In your Supabase Dashboard:
-- Navigate to: Authentication -> Users -> Click "Add user" -> "Create user"
-- Create Account 1: e.g. "you@tented.love" with a strong password.
-- Create Account 2: e.g. "girlfriend@tented.love" with a strong password.
--
-- Notice: Do NOT enable public signup in Supabase Auth settings!
-- Go to: Authentication -> Providers -> Email -> Turn OFF "Enable Signup" 
-- so strangers cannot register accounts.

-- Step 2: Retrieve the UUIDs for both users from the Auth -> Users table.
-- Replace the UUIDs below with the actual UUIDs from your dashboard:

/*
DO $$
DECLARE
    v_user1_id UUID := '00000000-0000-0000-0000-000000000001'; -- Replace with your user ID
    v_user2_id UUID := '00000000-0000-0000-0000-000000000002'; -- Replace with your girlfriend's user ID
BEGIN
    -- Provision Partner 1
    INSERT INTO public.couple_members (user_id, role, display_name, avatar_emoji)
    VALUES (v_user1_id, 'partner_1', 'My Love', '🤴')
    ON CONFLICT (user_id) DO UPDATE SET 
        role = EXCLUDED.role,
        display_name = EXCLUDED.display_name,
        avatar_emoji = EXCLUDED.avatar_emoji;

    -- Provision Partner 2
    INSERT INTO public.couple_members (user_id, role, display_name, avatar_emoji)
    VALUES (v_user2_id, 'partner_2', 'My Queen', '👸')
    ON CONFLICT (user_id) DO UPDATE SET 
        role = EXCLUDED.role,
        display_name = EXCLUDED.display_name,
        avatar_emoji = EXCLUDED.avatar_emoji;

    RAISE NOTICE 'Both couple members successfully provisioned into Tented allowlist!';
END $$;
*/

-- Step 3: Verification Query
-- Run this query to ensure exactly 2 accounts are registered:
SELECT 
    cm.user_id,
    cm.role,
    cm.display_name,
    cm.avatar_emoji,
    au.email,
    cm.created_at
FROM public.couple_members cm
JOIN auth.users au ON au.id = cm.user_id;
