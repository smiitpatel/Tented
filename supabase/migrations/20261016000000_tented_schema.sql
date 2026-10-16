-- ===================================================================================
-- TENTED️: Private Couple Chat — Full Database Schema, Security & Realtime Migration
-- Migration: 20261016000000_tented_schema.sql
-- ===================================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable pg_cron if available on the Supabase instance
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pg_cron";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron extension not available or permissions restricted. Alternative cleanup provided.';
END $$;

-- ===================================================================================
-- 2. Clean Existing Schema (Safe re-run)
-- ===================================================================================
DROP TRIGGER IF EXISTS trg_set_message_expiration ON public.messages;
DROP TRIGGER IF EXISTS trg_on_save_change ON public.message_saves;
DROP TRIGGER IF EXISTS trg_on_unsave_change ON public.message_saves;
DROP TRIGGER IF EXISTS trg_queue_photo_on_message_delete ON public.messages;
DROP TRIGGER IF EXISTS trg_couple_members_limit ON public.couple_members;

-- ===================================================================================
-- 3. Tables Definition
-- ===================================================================================

-- 3.1 Allowlist: Couple Members (Restricted to exactly 2 partners)
CREATE TABLE IF NOT EXISTS public.couple_members (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL UNIQUE CHECK (role IN ('partner_1', 'partner_2')),
    display_name TEXT NOT NULL DEFAULT 'Beloved',
    avatar_emoji TEXT NOT NULL DEFAULT '💖',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2 Chat Settings (Singleton configuration row: 24h or 72h retention)
CREATE TABLE IF NOT EXISTS public.chat_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    retention_hours INT NOT NULL DEFAULT 24 CHECK (retention_hours IN (24, 72)),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Insert default chat settings row if not present
INSERT INTO public.chat_settings (id, retention_hours)
VALUES (1, 24)
ON CONFLICT (id) DO NOTHING;

-- 3.3 Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT,
    image_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_saved BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_message_content CHECK (body IS NOT NULL OR image_path IS NOT NULL)
);

-- 3.4 Message Saves Table (Tracking which partner saved which message)
CREATE TABLE IF NOT EXISTS public.message_saves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    saved_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_message_save UNIQUE (message_id, saved_by)
);

-- 3.5 Expired Photo Queue Table (Reliable queue for storage file cleanup)
CREATE TABLE IF NOT EXISTS public.expired_photo_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cleaned_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deleted', 'failed')),
    error_message TEXT
);

-- ===================================================================================
-- 4. Indexes for Performance & Scalability
-- ===================================================================================
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_expires_at ON public.messages(expires_at) WHERE is_saved = FALSE;
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_saved ON public.messages(is_saved);
CREATE INDEX IF NOT EXISTS idx_message_saves_msg ON public.message_saves(message_id);
CREATE INDEX IF NOT EXISTS idx_message_saves_user ON public.message_saves(saved_by);
CREATE INDEX IF NOT EXISTS idx_photo_queue_status ON public.expired_photo_queue(status) WHERE status = 'pending';

-- ===================================================================================
-- 5. Helper Functions & Security Definers
-- ===================================================================================

-- 5.1 Fast, non-recursive member validation
CREATE OR REPLACE FUNCTION public.is_couple_member(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.couple_members WHERE user_id = p_user_id
  );
$$;

-- 5.2 Get active retention hours safely
CREATE OR REPLACE FUNCTION public.get_active_retention_hours()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE((SELECT retention_hours FROM public.chat_settings WHERE id = 1), 24);
$$;

-- ===================================================================================
-- 6. Triggers for Business Logic & Immutability
-- ===================================================================================

-- 6.1 Automatically calculate message expiration upon insertion
CREATE OR REPLACE FUNCTION public.fn_before_insert_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hours INT;
BEGIN
    -- Force sender_id to authenticated user to prevent sender spoofing
    NEW.sender_id := auth.uid();
    
    -- Ensure fresh message starts unsaved
    NEW.is_saved := FALSE;
    NEW.created_at := now();
    
    -- Calculate trusted expiration from current chat settings
    v_hours := public.get_active_retention_hours();
    NEW.expires_at := now() + (v_hours || ' hours')::INTERVAL;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_message_expiration
    BEFORE INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_before_insert_message();

-- 6.2 When a message is saved, set is_saved = TRUE
CREATE OR REPLACE FUNCTION public.fn_after_save_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.messages
    SET is_saved = TRUE
    WHERE id = NEW.message_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_save_change
    AFTER INSERT ON public.message_saves
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_after_save_insert();

-- 6.3 When a message is unsaved: if no saves remain, recalculate expiration
CREATE OR REPLACE FUNCTION public.fn_after_save_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_remaining_saves INT;
    v_hours INT;
BEGIN
    SELECT COUNT(*) INTO v_remaining_saves
    FROM public.message_saves
    WHERE message_id = OLD.message_id;

    IF v_remaining_saves = 0 THEN
        v_hours := public.get_active_retention_hours();
        UPDATE public.messages
        SET is_saved = FALSE,
            expires_at = now() + (v_hours || ' hours')::INTERVAL
        WHERE id = OLD.message_id;
    END IF;

    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_on_unsave_change
    AFTER DELETE ON public.message_saves
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_after_save_delete();

-- 6.4 When a message is deleted, queue its photo for Storage cleanup
CREATE OR REPLACE FUNCTION public.fn_queue_photo_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.image_path IS NOT NULL AND OLD.image_path <> '' THEN
        INSERT INTO public.expired_photo_queue (image_path, status)
        VALUES (OLD.image_path, 'pending');
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_queue_photo_on_message_delete
    AFTER DELETE ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_queue_photo_on_delete();

-- ===================================================================================
-- 7. Automated Cleanup Logic (pg_cron + RPC Function)
-- ===================================================================================

-- 7.1 RPC Function to clean up expired messages and return counts
CREATE OR REPLACE FUNCTION public.cleanup_expired_messages()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INT;
BEGIN
    -- Delete all unsaved messages where expiration time has elapsed
    DELETE FROM public.messages
    WHERE is_saved = FALSE AND expires_at < now();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', TRUE,
        'deleted_messages', v_deleted_count,
        'cleaned_at', now()
    );
END;
$$;

-- 7.2 RPC Function to retrieve and mark queued photos for frontend/worker cleanup
CREATE OR REPLACE FUNCTION public.get_pending_photo_cleanups()
RETURNS TABLE (id UUID, image_path TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id, image_path 
    FROM public.expired_photo_queue 
    WHERE status = 'pending'
    LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.mark_photos_cleaned(p_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.expired_photo_queue
    SET status = 'deleted', cleaned_at = now()
    WHERE id = ANY(p_ids);
END;
$$;

-- 7.3 Attempt pg_cron schedule (Runs every 15 minutes)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('tented_cleanup_job');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'tented_cleanup_job',
      '*/15 * * * *',
      'SELECT public.cleanup_expired_messages();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule pg_cron job automatically. Cleanup will also run upon chat sync.';
END $$;

-- ===================================================================================
-- 8. Row Level Security (RLS) Policies
-- ===================================================================================

-- Enable RLS on all tables
ALTER TABLE public.couple_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expired_photo_queue ENABLE ROW LEVEL SECURITY;

-- 8.1 couple_members Policies:
-- Only approved couple members can view the couple profiles
CREATE POLICY "couple_members_select"
    ON public.couple_members FOR SELECT
    USING (public.is_couple_member(auth.uid()));

-- Members cannot insert/delete themselves (must be provisioned by admin/migration)
CREATE POLICY "couple_members_insert"
    ON public.couple_members FOR INSERT
    WITH CHECK (FALSE);

CREATE POLICY "couple_members_delete"
    ON public.couple_members FOR DELETE
    USING (FALSE);

-- A member can update only their own display name or emoji avatar
CREATE POLICY "couple_members_update_own"
    ON public.couple_members FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 8.2 chat_settings Policies:
CREATE POLICY "chat_settings_select"
    ON public.chat_settings FOR SELECT
    USING (public.is_couple_member(auth.uid()));

CREATE POLICY "chat_settings_update"
    ON public.chat_settings FOR UPDATE
    USING (public.is_couple_member(auth.uid()))
    WITH CHECK (public.is_couple_member(auth.uid()));

CREATE POLICY "chat_settings_insert"
    ON public.chat_settings FOR INSERT
    WITH CHECK (FALSE);

CREATE POLICY "chat_settings_delete"
    ON public.chat_settings FOR DELETE
    USING (FALSE);

-- 8.3 messages Policies:
-- Only couple members can read non-expired or saved messages
CREATE POLICY "messages_select_allowed"
    ON public.messages FOR SELECT
    USING (
        public.is_couple_member(auth.uid())
        AND (is_saved = TRUE OR expires_at > now())
    );

-- Only couple members can send messages, and sender_id must be self
CREATE POLICY "messages_insert_allowed"
    ON public.messages FOR INSERT
    WITH CHECK (
        public.is_couple_member(auth.uid())
        AND auth.uid() = sender_id
    );

-- Deletion: Any couple member can delete a message (with confirmation)
CREATE POLICY "messages_delete_allowed"
    ON public.messages FOR DELETE
    USING (public.is_couple_member(auth.uid()));

-- Updates to messages are disabled from client (save state is managed via message_saves)
CREATE POLICY "messages_update_denied"
    ON public.messages FOR UPDATE
    USING (FALSE);

-- 8.4 message_saves Policies:
CREATE POLICY "saves_select_allowed"
    ON public.message_saves FOR SELECT
    USING (public.is_couple_member(auth.uid()));

CREATE POLICY "saves_insert_allowed"
    ON public.message_saves FOR INSERT
    WITH CHECK (
        public.is_couple_member(auth.uid())
        AND auth.uid() = saved_by
    );

CREATE POLICY "saves_delete_allowed"
    ON public.message_saves FOR DELETE
    USING (
        public.is_couple_member(auth.uid())
        AND auth.uid() = saved_by
    );

-- 8.5 expired_photo_queue Policies:
CREATE POLICY "photo_queue_couple_access"
    ON public.expired_photo_queue FOR ALL
    USING (public.is_couple_member(auth.uid()));

-- ===================================================================================
-- 9. Supabase Storage Configuration & Policies
-- ===================================================================================

-- Create the private bucket 'couple-photos' if it does not exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'couple-photos',
    'couple-photos',
    FALSE,
    5242880, -- 5 MB in bytes
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = FALSE,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS Policies on storage.objects
-- Note: Enable RLS on storage.objects is handled by Supabase default.

-- 9.1 Download: Only couple members can view / download photos
DROP POLICY IF EXISTS "couple_photos_download" ON storage.objects;
CREATE POLICY "couple_photos_download"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'couple-photos'
        AND public.is_couple_member(auth.uid())
    );

-- 9.2 Upload: Only couple members can upload into their folder or general couple-photos
DROP POLICY IF EXISTS "couple_photos_upload" ON storage.objects;
CREATE POLICY "couple_photos_upload"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'couple-photos'
        AND public.is_couple_member(auth.uid())
    );

-- 9.3 Delete: Couple members or cleanup routines can delete photos
DROP POLICY IF EXISTS "couple_photos_delete" ON storage.objects;
CREATE POLICY "couple_photos_delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'couple-photos'
        AND public.is_couple_member(auth.uid())
    );

-- ===================================================================================
-- 10. Enable Supabase Realtime Publication
-- ===================================================================================
DO $$
BEGIN
    -- Add tables to supabase_realtime publication
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_saves;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_settings;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Set replica identity to FULL so that DELETE and UPDATE realtime events contain all columns
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.message_saves REPLICA IDENTITY FULL;
ALTER TABLE public.chat_settings REPLICA IDENTITY FULL;
