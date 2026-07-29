-- ============================================================
-- Migration: Add name, phone, birth_date to profiles
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. 컬럼 추가
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS birth_date DATE;

-- 2. handle_new_user 트리거 함수 업데이트
--    signUp 호출 시 options.data 에 담긴 값을 raw_user_meta_data 에서 읽어 함께 저장
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, phone, birth_date)
    VALUES (
        NEW.id,
        NEW.email,
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''),
        CASE
            WHEN NEW.raw_user_meta_data->>'birth_date' IS NOT NULL
             AND NEW.raw_user_meta_data->>'birth_date' <> ''
            THEN (NEW.raw_user_meta_data->>'birth_date')::DATE
            ELSE NULL
        END
    )
    ON CONFLICT (id) DO UPDATE SET
        email      = EXCLUDED.email,
        name       = COALESCE(EXCLUDED.name, public.profiles.name),
        phone      = COALESCE(EXCLUDED.phone, public.profiles.phone),
        birth_date = COALESCE(EXCLUDED.birth_date, public.profiles.birth_date),
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
