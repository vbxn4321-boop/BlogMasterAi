-- 텔레그램 봇 연동: 사용자별 chat_id 저장 + 딥링크 인증코드 임시 테이블
-- 사용자가 서비스에서 "텔레그램 연동" 버튼을 누르면 임의의 인증코드를 발급받아
-- t.me/<bot>?start=<code> 딥링크로 이동하고, 봇이 /start를 받으면 이 코드로
-- profiles.telegram_chat_id를 채운다. 이후 스케줄러가 이 chat_id로 예약 메시지를 보낸다.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

-- 한 텔레그램 계정이 두 회원에 동시에 연결되는 것을 방지. 연동 안 한 사용자들의 NULL은
-- 부분 인덱스라 서로 충돌하지 않는다 (WHERE 절 없는 일반 UNIQUE도 NULL끼리는 안 부딪히지만,
-- "값이 있을 때만 유니크"라는 의도를 명시적으로 드러내기 위해 부분 인덱스로 작성).
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_telegram_chat_id
    ON public.profiles(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- 딥링크 인증코드: 프론트에서 로그인한 사용자가 직접 자기 user_id로 INSERT하고,
-- 실제 매칭/사용 처리(used_at 기록)는 백엔드 웹훅이 service_role 키로 수행한다
-- (RLS를 우회하므로 UPDATE/DELETE 정책은 필요 없음).
CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_code ON public.telegram_link_codes(code);

ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own telegram_link_codes" ON public.telegram_link_codes;
CREATE POLICY "Users can insert own telegram_link_codes" ON public.telegram_link_codes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own telegram_link_codes" ON public.telegram_link_codes;
CREATE POLICY "Users can view own telegram_link_codes" ON public.telegram_link_codes
    FOR SELECT USING (auth.uid() = user_id);
