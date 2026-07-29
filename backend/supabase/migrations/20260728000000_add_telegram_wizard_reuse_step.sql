-- 발행설정 위저드: "네이버 블로그 카테고리"를 묻기 직전에, 이전 발행 이력이 있으면
-- "이전 발행 설정과 동일하게 하시겠어요?" 확인 단계를 끼워넣는다. 예를 누르면
-- 네이버카테고리/글주제/공개설정/지도 질문을 전부 건너뛰고 이전 값을 그대로 재사용,
-- 아니오면 지금처럼 하나씩 물어본다. 이전 발행 이력이 없으면 이 단계 자체를 건너뛴다.

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
        'reuse_prior_confirm',
        'naver_category',
        'topic_group', 'topic_pick',
        'visibility',
        'map_use', 'map_address_text',
        'schedule_type', 'schedule_datetime_text',
        'confirm'
    )
);
