-- 텔레그램 "즉시발행/발행설정" 메뉴 + 발행설정 위저드 지원.

-- default_image_source: 즉시발행 시 해당 네이버 계정에 성공 발행 이력이 아직 없을 때 쓸
-- 관리자 기본값. default_tone/default_category/default_custom_instructions와 동일한
-- 용도·저장 위치(회원별 telegram_schedule_settings 1행)로 추가한다.
ALTER TABLE public.telegram_schedule_settings
    ADD COLUMN IF NOT EXISTS default_image_source TEXT NOT NULL DEFAULT 'gemini'
        CHECK (default_image_source IN ('gemini', 'stock'));

-- 발행설정 위저드(톤→이미지→카테고리→세부요청→최종확인) 진행 상태.
-- chat_id를 PK로 써서 "채팅(=사용자)당 진행 중인 위저드는 최대 1개"를 테이블 구조로 강제한다.
-- 같은 채팅에서 다른 글에 대해 "발행설정"을 다시 누르면 기존 행을 그냥 덮어쓴다(핸들러가 upsert).
-- 위저드를 끝까지 완료(발행하기 또는 취소)하면 행을 삭제한다. 중간에 방치된 행만 영구히 남을 수
-- 있는데, 이 테이블은 스케줄러의 제안/원고완성 메시지 발송 경로에서 전혀 참조되지 않으므로
-- 방치된 행이 그 사용자의 향후 슬롯 메시지를 막지는 않는다.
CREATE TABLE IF NOT EXISTS public.telegram_conversations (
    chat_id BIGINT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    naver_account_id UUID NOT NULL REFERENCES public.naver_accounts(id) ON DELETE CASCADE,
    step TEXT NOT NULL CHECK (step IN (
        'tone', 'image', 'category', 'instructions', 'instructions_custom_text', 'confirm'
    )),
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_conversations_user_id ON public.telegram_conversations(user_id);

ALTER TABLE public.telegram_conversations ENABLE ROW LEVEL SECURITY;

-- telegram_schedule_slots/telegram_link_codes와 동일한 컨벤션: 서비스 롤로만 쓰므로
-- SELECT/INSERT/UPDATE 정책만 두고 DELETE 정책은 두지 않는다.
DROP POLICY IF EXISTS "Users can view own telegram_conversations" ON public.telegram_conversations;
CREATE POLICY "Users can view own telegram_conversations" ON public.telegram_conversations
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own telegram_conversations" ON public.telegram_conversations;
CREATE POLICY "Users can insert own telegram_conversations" ON public.telegram_conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own telegram_conversations" ON public.telegram_conversations;
CREATE POLICY "Users can update own telegram_conversations" ON public.telegram_conversations
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
