-- PortOne 정기결제(빌링키) 연동을 위한 구독/결제 이력 테이블.
--
-- 보안 핵심: subscriptions/subscription_payments 둘 다 SELECT 정책만 만들고
-- INSERT/UPDATE 정책은 만들지 않는다. 즉 authenticated(익명키+RLS로 동작하는
-- 프론트엔드)는 조회만 가능하고, 쓰기는 오직 service_role(백엔드 engine_api.js/
-- scheduler.js)만 할 수 있다 — 사용자가 클라이언트에서 직접 구독 상태를
-- 조작할 수 없도록 막는 장치.

-- user_id UNIQUE: 사용자당 구독 레코드 1행만 유지 (재구독 시 upsert onConflict 대상으로 사용)
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    portone_billing_key_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
    current_period_end TIMESTAMPTZ NOT NULL,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_due ON public.subscriptions(status, current_period_end);

CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    portone_payment_id TEXT NOT NULL,
    portone_transaction_id TEXT UNIQUE, -- 동기 응답과 웹훅이 같은 결제를 중복 기록하지 않도록 dedupe
    amount INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('paid', 'failed')),
    failure_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON public.subscription_payments(user_id, created_at DESC);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
    FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view own subscription_payments" ON public.subscription_payments;
CREATE POLICY "Users can view own subscription_payments" ON public.subscription_payments
    FOR SELECT USING (auth.uid() = user_id);

-- profiles.plan_type을 결제 게이트로 쓰기 시작하므로, 클라이언트(authenticated)가
-- 직접 이 컬럼을 바꿔 무료로 구독자가 되는 걸 원천 차단한다. service_role은
-- RLS/권한을 우회하므로 백엔드의 결제 성공 처리 로직은 계속 정상 동작한다.
REVOKE UPDATE (plan_type) ON public.profiles FROM authenticated;
