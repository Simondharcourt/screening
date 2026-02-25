-- Add missing columns to screenings table for Vapi Integration
ALTER TABLE public.screenings 
ADD COLUMN IF NOT EXISTS call_status VARCHAR(50) DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS transcript TEXT;
