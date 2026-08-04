-- ============================================================
-- Migration: Add free_trial_count column to profiles
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS free_trial_count INTEGER DEFAULT 3;
