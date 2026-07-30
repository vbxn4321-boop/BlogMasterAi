-- 구독 등급(베이직/프로/컴퍼니) 관리자 설정 테이블.
-- 지금까지 하드코딩되어 있던 값들(가격=환경변수 PORTONE_PRO_PLAN_PRICE 1개,
-- 네이버 계정 등록 개수=DB 트리거의 고정값 3)을 관리자 화면에서 즉시 수정 가능한
-- DB 테이블로 옮기기 위한 마이그레이션.
--
-- max_prompts(개인 프롬프트 등록 가능 수)는 아직 그 기능 자체가 없으므로 값만
-- 저장해두고 실제로 어디서도 강제(enforce)하지 않는다 — 기능이 생기면 그때 연결.

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    plan_key            TEXT PRIMARY KEY CHECK (plan_key IN ('basic', 'pro', 'company')),
    display_name        TEXT NOT NULL,
    price               INTEGER NOT NULL DEFAULT 0,
    max_naver_accounts  INTEGER NOT NULL DEFAULT 1,
    max_prompts         INTEGER,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 초기값(placeholder) — pro는 기존 PORTONE_PRO_PLAN_PRICE(29000원)/기존 계정 한도(3개)를
-- 그대로 승계해 기존 구독자 동작이 바뀌지 않도록 하고, basic/company는 관리자가 신규 화면에서
-- 바로 수정할 것을 전제로 한 예시값이다.
INSERT INTO public.subscription_plans (plan_key, display_name, price, max_naver_accounts, max_prompts) VALUES
    ('basic',   '베이직', 9900,  1,  5),
    ('pro',     '프로',   29000, 3,  20),
    ('company', '컴퍼니', 99000, 10, 50)
ON CONFLICT (plan_key) DO NOTHING;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- 조회는 로그인 사용자 누구나 가능(구독 안내 화면 등에 노출될 수 있음), 쓰기는 service_role만
-- (관리자 화면은 반드시 admin-subscription-actions.js의 requireAdmin()을 거쳐 service_role로 기록)
DROP POLICY IF EXISTS "Anyone can view subscription plans" ON public.subscription_plans;
CREATE POLICY "Anyone can view subscription plans" ON public.subscription_plans
    FOR SELECT USING (true);

-- profiles.plan_type: 'free' 위에 3단계 유료 등급이 새로 추가됨 ('free'는 그대로 유지)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_type_check
    CHECK (plan_type IN ('free', 'basic', 'pro', 'company'));

-- 네이버 계정 등록 개수 제한을 등급별로 차등 적용하도록 트리거 재정의.
-- free(또는 미설정)는 UI 단에서 이미 계정 추가 자체를 막고 있지만, 방어적으로 0개로 제한.
-- basic/pro/company는 subscription_plans.max_naver_accounts를 그때그때 조회 — 관리자가
-- 값을 바꾸면 다음 INSERT 시도부터 즉시 반영된다(재배포 불필요).
CREATE OR REPLACE FUNCTION check_max_naver_accounts()
RETURNS TRIGGER AS $$
DECLARE
    user_plan TEXT;
    max_allowed INTEGER;
BEGIN
    SELECT plan_type INTO user_plan FROM public.profiles WHERE id = NEW.user_id;

    IF user_plan IS NULL OR user_plan = 'free' THEN
        max_allowed := 0;
    ELSE
        SELECT max_naver_accounts INTO max_allowed
        FROM public.subscription_plans WHERE plan_key = user_plan;

        IF max_allowed IS NULL THEN
            max_allowed := 3; -- 요금제 테이블에 없는 값이면 기존 기본 동작(3개)으로 안전 폴백
        END IF;
    END IF;

    IF (SELECT COUNT(*) FROM public.naver_accounts WHERE user_id = NEW.user_id) >= max_allowed THEN
        RAISE EXCEPTION 'Maximum of % Naver accounts per user allowed.', max_allowed;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
