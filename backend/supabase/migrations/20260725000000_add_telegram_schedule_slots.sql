-- 텔레그램 자동화: 고정 2슬롯(아침/오후)에서 사용자당 슬롯을 원하는 만큼 추가/삭제할 수
-- 있는 구조로 변경. 슬롯마다 모드(suggest=키워드만 제안, draft_approval=원고 완성 후 승인)를
-- 개별로 고를 수 있다. 아직 배포 전 기능이라 옛 slot_a_*/slot_b_* 컬럼의 값은 옮기지 않고
-- 그냥 지운다 — 관리자 화면에서 다시 입력하면 된다.

CREATE TABLE IF NOT EXISTS public.telegram_schedule_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('suggest', 'draft_approval')),
    enabled BOOLEAN NOT NULL DEFAULT false,
    time TEXT NOT NULL CHECK (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    message_template TEXT NOT NULL,
    last_sent_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_schedule_slots_user_id ON public.telegram_schedule_slots(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_schedule_slots_time_lookup
    ON public.telegram_schedule_slots(time) WHERE enabled;

ALTER TABLE public.telegram_schedule_slots ENABLE ROW LEVEL SECURITY;

-- telegram_schedule_settings/telegram_link_codes와 동일한 컨벤션: 이 테이블도 서비스 롤로만
-- 쓰기 때문에 SELECT/INSERT/UPDATE 정책만 두고 DELETE 정책은 안 만든다.
DROP POLICY IF EXISTS "Users can view own telegram_schedule_slots" ON public.telegram_schedule_slots;
CREATE POLICY "Users can view own telegram_schedule_slots" ON public.telegram_schedule_slots
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own telegram_schedule_slots" ON public.telegram_schedule_slots;
CREATE POLICY "Users can insert own telegram_schedule_slots" ON public.telegram_schedule_slots
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own telegram_schedule_slots" ON public.telegram_schedule_slots;
CREATE POLICY "Users can update own telegram_schedule_slots" ON public.telegram_schedule_slots
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 옛 고정 2슬롯 컬럼 제거 (데이터 이관 없음)
ALTER TABLE public.telegram_schedule_settings
    DROP COLUMN IF EXISTS slot_a_enabled,
    DROP COLUMN IF EXISTS slot_a_time,
    DROP COLUMN IF EXISTS slot_a_message_template,
    DROP COLUMN IF EXISTS slot_a_last_sent_date,
    DROP COLUMN IF EXISTS slot_b_enabled,
    DROP COLUMN IF EXISTS slot_b_time,
    DROP COLUMN IF EXISTS slot_b_message_template,
    DROP COLUMN IF EXISTS slot_b_last_sent_date;
