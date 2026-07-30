-- 1:1 문의 테이블. 사용자가 대시보드 플로팅 위젯에서 보낸 문의와 관리자의 답변을
-- 같은 행에 저장한다(실제 이메일 발송 없음 — /admin/inquiries 화면에서 확인하는 방식).

CREATE TABLE IF NOT EXISTS public.inquiries (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered')),
    admin_reply   TEXT,
    replied_at    TIMESTAMPTZ,
    replied_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    -- 사용자가 답변을 확인한 시각 — NULL이면 미확인. status='answered' AND user_read_at IS NULL
    -- 조건으로 플로팅 아이콘의 빨간 점 표시 여부를 판단한다.
    user_read_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_user ON public.inquiries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON public.inquiries(status, created_at DESC);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- 사용자는 자기 문의만 보고/작성 가능. 관리자 화면(admin-inquiry-actions.js)은 이 RLS를
-- 우회하는 service_role 키로 동작하며 requireAdmin()으로 별도 검증한다.
DROP POLICY IF EXISTS "Users can view own inquiries" ON public.inquiries;
CREATE POLICY "Users can view own inquiries" ON public.inquiries
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own inquiries" ON public.inquiries;
CREATE POLICY "Users can insert own inquiries" ON public.inquiries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own inquiries" ON public.inquiries;
CREATE POLICY "Users can update own inquiries" ON public.inquiries
    FOR UPDATE USING (auth.uid() = user_id);

-- 사용자가 UPDATE로 건드릴 수 있는 건 "읽음 처리(user_read_at)" 뿐이어야 한다.
-- message/status/admin_reply를 직접 고쳐 스스로 "답변완료"로 위조하는 것을 막기 위해
-- 컬럼 단위로 권한을 좁힌다(위 RLS 정책은 "어떤 행"을, 이 GRANT는 "어떤 컬럼"을 제어).
REVOKE UPDATE ON public.inquiries FROM authenticated;
GRANT UPDATE (user_read_at) ON public.inquiries TO authenticated;
