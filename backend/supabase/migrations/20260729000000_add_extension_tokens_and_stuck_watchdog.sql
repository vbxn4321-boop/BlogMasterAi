-- ── 크롬 확장프로그램 전용 토큰 (Supabase 세션 사본 대신 만료되지 않는 자체 토큰) ──
-- 사용자당 1개(재발급 시 upsert로 이전 토큰 자동 무효화). raw 토큰은 저장하지 않고
-- SHA-256 해시만 저장한다 — telegram_schedule_settings와 동일하게 user_id를 PK로 사용.
CREATE TABLE IF NOT EXISTS public.extension_tokens (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- 해시로 역조회(인증 미들웨어의 핵심 경로)가 빈번하므로 별도 유니크 인덱스 필요
-- (PK는 user_id라 token_hash 조회엔 안 쓰임). 부수적으로 해시 충돌을 조용한
-- 교차-사용자 인증 성공이 아니라 명시적 DB 에러로 만들어준다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_extension_tokens_hash
    ON public.extension_tokens(token_hash);

ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own extension_tokens" ON public.extension_tokens;
CREATE POLICY "Users can view own extension_tokens" ON public.extension_tokens
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own extension_tokens" ON public.extension_tokens;
CREATE POLICY "Users can insert own extension_tokens" ON public.extension_tokens
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own extension_tokens" ON public.extension_tokens;
CREATE POLICY "Users can update own extension_tokens" ON public.extension_tokens
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 발행 정체 감시 ──
-- stuck_check_since: '처리가 실제로 시작된' 시점. /api/extension/prepare와 /api/posts/trigger
-- 양쪽 모두 status를 'generating'으로 처음 바꾸는 지점이라 두 곳 다에서 세팅해야
-- 레거시 Puppeteer 경로(checkPendingPosts 30초 세이프티넷을 통해 여전히 호출 가능)로
-- 들어간 글도 감시망에 포함된다. created_at을 쓰지 않는 이유: 텔레그램 "제안형"은 사람이
-- 답장하기 전까지 telegram_suggested 상태로 몇 시간이고 머물 수 있어서, created_at 기준으로
-- "오래 멈췄다"를 판단하면 승인하자마자 바로 오탐이 뜬다.
-- stuck_notified_at: 같은 정체 에피소드에 대한 중복 알림 방지용 — 리셋 불필요
-- (terminal 상태로 빠지면 워치독 쿼리 자체에서 자연히 제외됨).
ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS stuck_check_since TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stuck_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_posts_stuck_watchdog
    ON public.posts(status, stuck_check_since)
    WHERE stuck_notified_at IS NULL;
