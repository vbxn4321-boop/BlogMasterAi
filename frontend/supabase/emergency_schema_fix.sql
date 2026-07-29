-- ============================================================
-- Blog Master AI: ULTIMATE SCHEMA FIX
-- Run this in Supabase SQL Editor to ensure all columns exist
-- ============================================================

-- 1. Ensure Profiles table has is_admin
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2. Ensure naver_accounts has ALL required columns
ALTER TABLE public.naver_accounts 
ADD COLUMN IF NOT EXISTS custom_content_prompt TEXT,
ADD COLUMN IF NOT EXISTS custom_image_prompt TEXT,
ADD COLUMN IF NOT EXISTS custom_thumbnail_prompt TEXT,
ADD COLUMN IF NOT EXISTS biz_phone TEXT,
ADD COLUMN IF NOT EXISTS biz_kakao_id TEXT,
ADD COLUMN IF NOT EXISTS biz_kakao_url TEXT,
ADD COLUMN IF NOT EXISTS biz_map_address TEXT,
ADD COLUMN IF NOT EXISTS biz_cta_image_url TEXT,
ADD COLUMN IF NOT EXISTS biz_footer_text TEXT,
ADD COLUMN IF NOT EXISTS biz_image_links JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS biz_footer_components JSONB DEFAULT '[]'::jsonb;

-- 3. Ensure prompt_vault has thumbnail_prompt
ALTER TABLE public.prompt_vault 
ADD COLUMN IF NOT EXISTS thumbnail_prompt TEXT;

-- 4. Fix RLS for Admin Access (Fixed recursion)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply update policy for naver_accounts
DROP POLICY IF EXISTS "Users can update own naver_accounts" ON public.naver_accounts;
CREATE POLICY "Users can update own naver_accounts" ON public.naver_accounts
    FOR UPDATE USING (auth.uid() = user_id OR public.check_is_admin());

-- Ensure SELECT is also allowed for admins
DROP POLICY IF EXISTS "Users can view own naver_accounts" ON public.naver_accounts;
CREATE POLICY "Users can view own naver_accounts" ON public.naver_accounts
    FOR SELECT USING (auth.uid() = user_id OR public.check_is_admin());

-- 5. Set YOUR user as admin (OPTIONAL: replace with your email if needed)
-- UPDATE public.profiles SET is_admin = TRUE WHERE email = 'your-email@example.com';
