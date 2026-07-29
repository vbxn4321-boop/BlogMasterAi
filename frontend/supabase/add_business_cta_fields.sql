-- ============================================================
-- Blog Master AI: Business CTA & Footer Update (v5)
-- ============================================================

-- Add business information columns to naver_accounts
ALTER TABLE public.naver_accounts 
ADD COLUMN IF NOT EXISTS biz_phone TEXT,
ADD COLUMN IF NOT EXISTS biz_kakao_id TEXT,
ADD COLUMN IF NOT EXISTS biz_kakao_url TEXT,
ADD COLUMN IF NOT EXISTS biz_map_address TEXT,
ADD COLUMN IF NOT EXISTS biz_cta_image_url TEXT,
ADD COLUMN IF NOT EXISTS biz_footer_text TEXT;

-- Add corresponding columns to prompt_vault for default values per category
ALTER TABLE public.prompt_vault 
ADD COLUMN IF NOT EXISTS default_biz_phone TEXT,
ADD COLUMN IF NOT EXISTS default_biz_kakao_id TEXT,
ADD COLUMN IF NOT EXISTS default_biz_kakao_url TEXT,
ADD COLUMN IF NOT EXISTS default_biz_footer_text TEXT;

COMMENT ON COLUMN naver_accounts.biz_phone IS 'Business phone number for this account.';
COMMENT ON COLUMN naver_accounts.biz_kakao_url IS 'Full URL to the KakaoTalk channel.';
COMMENT ON COLUMN naver_accounts.biz_map_address IS 'Physical address for Naver Map integration.';
COMMENT ON COLUMN naver_accounts.biz_cta_image_url IS 'URL to a fixed banner image inserted at the end of every post.';
