-- ============================================================
-- Migration: Fix new user signup trigger to default to 'free' plan and 3 free trial credits
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. profiles 컬럼 기본값 'free' 및 free_trial_count 3 설정
ALTER TABLE public.profiles ALTER COLUMN plan_type SET DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS free_trial_count INTEGER DEFAULT 3;

-- 2. handle_new_user() 트리거 함수 수정 (신규 가입 시 무조건 plan_type = 'free' 부여)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        email,
        plan_type,
        free_trial_count,
        name,
        phone,
        birth_date,
        marketing_consent
    )
    VALUES (
        NEW.id,
        NEW.email,
        'free',
        3,
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''),
        CASE
            WHEN NEW.raw_user_meta_data->>'birth_date' IS NOT NULL
             AND NEW.raw_user_meta_data->>'birth_date' <> ''
            THEN (NEW.raw_user_meta_data->>'birth_date')::DATE
            ELSE NULL
        END,
        COALESCE((NEW.raw_user_meta_data->>'marketing_consent')::BOOLEAN, false)
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
