-- 푸터 컴포넌트 시스템 컬럼 추가
ALTER TABLE public.naver_accounts 
ADD COLUMN IF NOT EXISTS biz_footer_components JSONB DEFAULT '[]'::jsonb;
