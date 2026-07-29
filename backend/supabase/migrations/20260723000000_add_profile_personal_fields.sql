-- 회원가입 시 수집하는 이름/전화번호/생년월일이 auth.users.raw_user_meta_data에만 남고
-- profiles 테이블로는 반영되지 않고 있던 문제를 고친다 (회원정보 수정 기능을 위해 필요).
-- 마케팅 수신 동의(선택)도 나중에 캠페인 조회가 가능하도록 profiles 컬럼으로 저장한다.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS birth_date DATE,
    ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT false;

-- handle_new_user()를 교체 — 20260722000000의 plan_type='pro' 임시 정책은 그대로 유지하면서
-- 신규 가입자의 name/phone/birth_date/marketing_consent를 raw_user_meta_data에서 채워 넣는다.
-- birth_date 캐스팅은 예외 처리로 감싸서, 형식이 잘못된 값이 들어와도 회원가입 자체가
-- 실패하지 않도록 방어한다.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_birth_date DATE;
BEGIN
    BEGIN
        v_birth_date := NULLIF(TRIM(NEW.raw_user_meta_data->>'birth_date'), '')::DATE;
    EXCEPTION WHEN OTHERS THEN
        v_birth_date := NULL;
    END;

    INSERT INTO public.profiles (id, email, plan_type, name, phone, birth_date, marketing_consent)
    VALUES (
        NEW.id,
        NEW.email,
        'pro',
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''),
        v_birth_date,
        COALESCE((NEW.raw_user_meta_data->>'marketing_consent')::BOOLEAN, false)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 기존 회원 백필 — auth.users 메타데이터에 값이 있는데 profiles가 비어있는 경우만 채운다.
-- birth_date는 형식이 YYYY-MM-DD인 경우만 캐스팅해서, 메타데이터가 없거나 이상한 값이어도
-- 백필 전체가 에러로 중단되지 않게 한다.
UPDATE public.profiles p
SET
    name = COALESCE(p.name, NULLIF(TRIM(u.raw_user_meta_data->>'name'), '')),
    phone = COALESCE(p.phone, NULLIF(TRIM(u.raw_user_meta_data->>'phone'), '')),
    birth_date = COALESCE(
        p.birth_date,
        CASE WHEN u.raw_user_meta_data->>'birth_date' ~ '^\d{4}-\d{2}-\d{2}$'
             THEN (u.raw_user_meta_data->>'birth_date')::DATE
             ELSE NULL END
    ),
    marketing_consent = COALESCE(p.marketing_consent, (u.raw_user_meta_data->>'marketing_consent')::BOOLEAN, false),
    updated_at = NOW()
FROM auth.users u
WHERE p.id = u.id
  AND (p.name IS NULL OR p.phone IS NULL OR p.birth_date IS NULL OR p.marketing_consent IS NULL);
