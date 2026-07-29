-- 텔레그램 2단계 시간대별 자동 발행 제안 기능.
-- 아침 슬롯: 키워드만 제안(승인 시 그때 생성). 오후 슬롯: 원고를 미리 완성해두고 제목으로 승인만 받음.
-- 사용자당 1행이라 user_id를 PK로 써서 upsert(onConflict:'user_id')가 간단해지도록 한다.
-- enabled 컬럼은 전부 기본값 false — 설정 화면에서 직접 저장하기 전까지는 아무 메시지도 안 나감.

CREATE TABLE IF NOT EXISTS public.telegram_schedule_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    naver_account_id UUID REFERENCES public.naver_accounts(id) ON DELETE SET NULL,

    slot_a_enabled BOOLEAN NOT NULL DEFAULT false,
    slot_a_time TEXT NOT NULL DEFAULT '10:00'
        CHECK (slot_a_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    slot_a_message_template TEXT NOT NULL DEFAULT '오늘은 ''{keyword}'' 주제로 발행해보는건 어떨까요?',
    slot_a_last_sent_date DATE,

    slot_b_enabled BOOLEAN NOT NULL DEFAULT false,
    slot_b_time TEXT NOT NULL DEFAULT '15:00'
        CHECK (slot_b_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    slot_b_message_template TEXT NOT NULL DEFAULT '''{title}''라는 제목으로 원고를 작성해봤는데 발행할까요?',
    slot_b_last_sent_date DATE,

    default_tone TEXT NOT NULL DEFAULT '친근한 존댓말',
    default_category TEXT NOT NULL DEFAULT '일상',
    default_custom_instructions TEXT NOT NULL DEFAULT '',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tss_slot_a_lookup
    ON public.telegram_schedule_settings(slot_a_time) WHERE slot_a_enabled;
CREATE INDEX IF NOT EXISTS idx_tss_slot_b_lookup
    ON public.telegram_schedule_settings(slot_b_time) WHERE slot_b_enabled;

ALTER TABLE public.telegram_schedule_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own telegram_schedule_settings" ON public.telegram_schedule_settings;
CREATE POLICY "Users can view own telegram_schedule_settings" ON public.telegram_schedule_settings
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own telegram_schedule_settings" ON public.telegram_schedule_settings;
CREATE POLICY "Users can insert own telegram_schedule_settings" ON public.telegram_schedule_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own telegram_schedule_settings" ON public.telegram_schedule_settings;
CREATE POLICY "Users can update own telegram_schedule_settings" ON public.telegram_schedule_settings
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- posts.status 체크 제약 교체 — frontend/supabase/schema.sql은 이미 pending_extension조차
-- 빠져 있어 실제 DB와 어긋나 있으므로, 제약 이름을 가정하지 않고 posts.status에 걸린
-- CHECK 제약을 동적으로 찾아 지운 뒤 새 상태값을 포함해 재생성한다.
-- telegram_suggested: 아침 슬롯, 키워드 제안만 하고 아직 생성 전(승인 대기)
-- draft_pending_approval: 오후 슬롯, 원고까지 완성했지만 발행 승인 대기
--   (둘 다 확장프로그램 폴링 대상인 pending_extension이 아니고, 서버 재시작 좀비정리
--   대상(generating/pending/posting)도 아니라서 "사람 답장 대기 중"인 글이 안전하게 보존됨)
-- cancelled: 사용자가 텔레그램에서 "취소"를 누른 경우 — failed(실제 에러)와 로그상 구분하기 위해 별도로 둠
DO $$
DECLARE
    con RECORD;
BEGIN
    FOR con IN
        SELECT DISTINCT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
        WHERE t.relname = 'posts'
          AND c.contype = 'c'
          AND a.attname = 'status'
    LOOP
        EXECUTE format('ALTER TABLE public.posts DROP CONSTRAINT %I', con.conname);
    END LOOP;
END $$;

ALTER TABLE public.posts ADD CONSTRAINT posts_status_check CHECK (
    status IN (
        'pending', 'scheduled', 'generating', 'posting', 'success', 'failed',
        'pending_extension',
        'telegram_suggested', 'draft_pending_approval', 'cancelled'
    )
);
