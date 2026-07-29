-- Add thumbnail prompt fields
ALTER TABLE public.naver_accounts 
ADD COLUMN IF NOT EXISTS custom_thumbnail_prompt TEXT;

ALTER TABLE public.prompt_vault 
ADD COLUMN IF NOT EXISTS thumbnail_prompt TEXT;

COMMENT ON COLUMN naver_accounts.custom_thumbnail_prompt IS 'Admin-defined custom thumbnail (main image) generation instructions for this specific blog.';
COMMENT ON COLUMN prompt_vault.thumbnail_prompt IS 'Default thumbnail generation instructions for this category.';
