-- Add description field to servers table
-- This allows server owners to add a description to their server

ALTER TABLE servers 
ADD COLUMN IF NOT EXISTS description TEXT;
