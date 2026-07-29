-- ============================================================
-- Blog Master AI: Auth & Admin Fix
-- Run this in SQL Editor to bypass email verification
-- ============================================================

-- 1. Manually confirm a user (Replace with your email)
UPDATE auth.users 
SET email_confirmed_at = NOW(), 
    last_sign_in_at = NOW(),
    raw_app_meta_data = raw_app_meta_data || '{"provider":"email","providers":["email"]}'
WHERE email = '원하시는_이메일@주소.com';

-- 2. Set as Admin (Replace with your email)
UPDATE public.profiles
SET is_admin = TRUE
WHERE email = '원하시는_이메일@주소.com';
