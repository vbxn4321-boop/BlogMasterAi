-- Add progress tracking columns to posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS current_step TEXT,
ADD COLUMN IF NOT EXISTS progress_logs JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.posts.current_step IS '현재 진행 중인 모듈/단계 설명';
COMMENT ON COLUMN public.posts.progress_logs IS '상세 진행 로그 배열 (JSONB)';
COMMENT ON COLUMN public.posts.is_cancelled IS '사용자에 의한 중단 요청 여부';
