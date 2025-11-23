-- Create storage buckets for file uploads
-- Run this in Supabase SQL Editor

-- Create avatars bucket (public read access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Create server-images bucket (public read access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('server-images', 'server-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create message-attachments bucket (restricted access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for avatars bucket
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS Policies for server-images bucket
CREATE POLICY "Server images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'server-images');

CREATE POLICY "Server owners can upload server images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'server-images'
  AND EXISTS (
    SELECT 1 FROM servers 
    WHERE id = (storage.foldername(name))[1]::uuid
    AND owner_id = auth.uid()
  )
);

CREATE POLICY "Server owners can update server images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'server-images'
  AND EXISTS (
    SELECT 1 FROM servers 
    WHERE id = (storage.foldername(name))[1]::uuid
    AND owner_id = auth.uid()
  )
);

CREATE POLICY "Server owners can delete server images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'server-images'
  AND EXISTS (
    SELECT 1 FROM servers 
    WHERE id = (storage.foldername(name))[1]::uuid
    AND owner_id = auth.uid()
  )
);

-- RLS Policies for message-attachments bucket
CREATE POLICY "Message attachments are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'message-attachments');

CREATE POLICY "Authenticated users can upload message attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'message-attachments'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete their own message attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'message-attachments'
  AND auth.role() = 'authenticated'
);
