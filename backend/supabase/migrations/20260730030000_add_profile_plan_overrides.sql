-- 컴퍼니 등급 개별(회사별) 커스텀 설정. subscription_plans의 'company' 행은 기본 템플릿이고,
-- 실제 컴퍼니 회원의 결제 금액/한도는 이 컬럼들이 있으면 그 값을 최우선으로 사용한다.
-- free -> company로 전환하는 순간 관리자가 3개 다 필수로 입력하도록 프론트에서 강제한다
-- (DB 레벨에서는 NULL 허용 — free/basic/pro 회원에게는 애초에 의미 없는 값이라 NOT NULL 제약을 걸지 않음).
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS override_price INTEGER,
    ADD COLUMN IF NOT EXISTS override_max_naver_accounts INTEGER,
    ADD COLUMN IF NOT EXISTS override_max_prompts INTEGER;

-- 클라이언트(authenticated)가 스스로 이 값을 조작해 결제금액/한도를 위조하는 걸 막는다.
-- 쓰기는 오직 관리자 화면(admin-member-actions.js, service_role)만 가능.
REVOKE UPDATE (override_price, override_max_naver_accounts, override_max_prompts) ON public.profiles FROM authenticated;

-- 네이버 계정 등록 한도 트리거: 컴퍼니 등급이면서 override_max_naver_accounts가 설정돼 있으면
-- subscription_plans의 컴퍼니 기본값보다 이 개별 값을 우선한다.
CREATE OR REPLACE FUNCTION check_max_naver_accounts()
RETURNS TRIGGER AS $$
DECLARE
    user_plan TEXT;
    user_override INTEGER;
    max_allowed INTEGER;
BEGIN
    SELECT plan_type, override_max_naver_accounts INTO user_plan, user_override
    FROM public.profiles WHERE id = NEW.user_id;

    IF user_plan IS NULL OR user_plan = 'free' THEN
        max_allowed := 0;
    ELSIF user_plan = 'company' AND user_override IS NOT NULL THEN
        max_allowed := user_override;
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
