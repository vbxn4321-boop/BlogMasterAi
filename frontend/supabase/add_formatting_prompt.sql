-- ============================================================
-- Add formatting prompt
-- ============================================================
ALTER TABLE public.naver_accounts 
ADD COLUMN IF NOT EXISTS custom_formatting_prompt TEXT;

COMMENT ON COLUMN naver_accounts.custom_formatting_prompt IS 'Admin-defined custom formatting rules (quotes, bolds, emojis) for this specific blog.';
