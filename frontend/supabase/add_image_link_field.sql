-- 이미지 링크 정보 컬럼 추가
ALTER TABLE public.naver_accounts 
ADD COLUMN IF NOT EXISTS biz_image_links JSONB DEFAULT '{}'::jsonb;
