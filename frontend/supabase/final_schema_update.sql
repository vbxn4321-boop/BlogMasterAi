-- ============================================================
-- Blog Master AI: Final Unified Schema Update (v4 - Fixed Recursion)
-- ============================================================

-- 1. Helper function for admin check (Bypasses RLS recursion)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add admin flag to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 3. Add custom prompt fields to naver_accounts
ALTER TABLE public.naver_accounts 
ADD COLUMN IF NOT EXISTS custom_content_prompt TEXT,
ADD COLUMN IF NOT EXISTS custom_image_prompt TEXT;

-- 4. Update RLS policies using the helper function
DROP POLICY IF EXISTS "Admins can view all naver_accounts" ON public.naver_accounts;
CREATE POLICY "Admins can view all naver_accounts" ON public.naver_accounts
    FOR SELECT USING (public.check_is_admin());

DROP POLICY IF EXISTS "Admins can update all naver_accounts" ON public.naver_accounts;
CREATE POLICY "Admins can update all naver_accounts" ON public.naver_accounts
    FOR UPDATE USING (public.check_is_admin());

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (public.check_is_admin());

COMMENT ON COLUMN naver_accounts.custom_content_prompt IS 'Admin-defined custom writing instructions for this specific blog.';
COMMENT ON COLUMN naver_accounts.custom_image_prompt IS 'Admin-defined custom image generation instructions for this specific blog.';
