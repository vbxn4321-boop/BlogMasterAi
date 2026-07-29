-- PortOne 결제 연동이 아직 완전히 마무리되지 않아, 그동안은 신규 가입자도
-- 기존 사용자들처럼 제한 없이 서비스를 이용할 수 있도록 가입 시 plan_type을
-- 기본값('free') 대신 임시로 'pro'로 부여한다.
--
-- 이 함수는 frontend/supabase/schema.sql에 정의된 handle_new_user() 트리거 함수를
-- CREATE OR REPLACE로 덮어쓰는 것 — auth.users에 새 행이 생기면 profiles를
-- 자동 생성하는 트리거(on_auth_user_created) 자체는 그대로 재사용하고, 함수
-- 본문만 plan_type='pro'를 명시하도록 바꾼다.
--
-- 나중에 실제로 결제 게이팅을 시작할 때는, 아래 INSERT에서 plan_type 컬럼을
-- 빼거나 'free'로 바꿔서 이 함수를 다시 CREATE OR REPLACE 하면 원상복구된다.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, plan_type)
    VALUES (NEW.id, NEW.email, 'pro');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
