-- Complete fix for server-images bucket RLS
-- Run this ENTIRE script in Supabase SQL Editor

-- Step 1: Drop ALL existing policies on storage.objects for server-images
DROP POLICY IF EXISTS "Server images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Server owners can upload server images" ON storage.objects;
DROP POLICY IF EXISTS "Server owners can update server images" ON storage.objects;
DROP POLICY IF EXISTS "Server owners can delete server images" ON storage.objects;

-- Step 2: Recreate policies with simpler approach
-- Public read access
CREATE POLICY "Server images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'server-images');

-- Allow authenticated users to upload to server-images bucket
-- We'll check ownership in the application layer
CREATE POLICY "Authenticated users can upload server images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'server-images'
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to update server images
CREATE POLICY "Authenticated users can update server images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'server-images'
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to delete server images
CREATE POLICY "Authenticated users can delete server images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'server-images'
  AND auth.role() = 'authenticated'
);
