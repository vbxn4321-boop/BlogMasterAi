-- 구독 전 체험(트라이얼) 플로우: 비구독 사용자의 기능별 사용 횟수를 기록하기 위한 테이블.
-- 황금키워드 검색은 비구독 사용자 기준 최초 3회까지만 허용되며, 이 테이블의
-- (user_id, feature='keyword_search') 행 수로 사용 횟수를 판정한다.
--
-- plan_type 컬럼은 frontend/supabase/schema.sql의 최초 스키마에 포함되어 있었으나,
-- 이후 여러 수기 ALTER 스크립트로 스키마가 드리프트된 이력이 있어 운영 DB에 실제로
-- 남아있는지 보장할 수 없다. IF NOT EXISTS로 안전하게 존재를 재확인한다.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'pro'));

CREATE TABLE IF NOT EXISTS public.usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_feature ON public.usage_logs(user_id, feature);

ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage_logs" ON public.usage_logs
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own usage_logs" ON public.usage_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
