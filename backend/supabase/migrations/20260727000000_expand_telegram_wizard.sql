-- 발행설정 위저드 확장: 키워드 확정/서브키워드/네이버 실제 카테고리/글주제/공개설정/
-- 지도 등 상세설정/즉시-예약발행을 추가해서 "새 포스팅" 탭 항목을 전부 커버한다.

ALTER TABLE public.telegram_conversations
    ADD COLUMN IF NOT EXISTS wizard_cache JSONB NOT NULL DEFAULT '{}'::jsonb;
-- 네이버 카테고리 목록, 글주제 대분류 선택 등 "최종 answers에는 안 들어가는 중간 상태"를
-- answers와 분리해서 보관 — confirm 시 answers→publish_options 매핑을 단순하게 유지하기 위함.

-- step CHECK 제약 교체 — 이름을 가정하지 않고 telegram_conversations.step에 걸린
-- CHECK 제약을 동적으로 찾아 지운 뒤 새 단계값을 포함해 재생성한다 (이전 마이그레이션들과 동일한
-- 안전한 교체 패턴, 20260724000000_add_telegram_schedule_slots.sql 참고).
DO $$
DECLARE
    con RECORD;
BEGIN
    FOR con IN
        SELECT DISTINCT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
        WHERE t.relname = 'telegram_conversations'
          AND c.contype = 'c'
          AND a.attname = 'step'
    LOOP
        EXECUTE format('ALTER TABLE public.telegram_conversations DROP CONSTRAINT %I', con.conname);
    END LOOP;
END $$;

ALTER TABLE public.telegram_conversations ADD CONSTRAINT telegram_conversations_step_check CHECK (
    step IN (
        'keyword_confirm', 'keyword_text',
        'sub_keywords',
        'tone', 'image', 'category', 'instructions', 'instructions_custom_text',
        'naver_category',
        'topic_group', 'topic_pick',
        'visibility',
        'map_use', 'map_address_text',
        'schedule_type', 'schedule_datetime_text',
        'confirm'
    )
);
