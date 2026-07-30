-- 사용자가 본인 문의(및 그에 달린 답변)를 "받은 메세지" 목록에서 직접 삭제할 수 있도록
-- DELETE RLS 정책 추가. 기존 마이그레이션(20260730010000)에는 SELECT/INSERT/UPDATE만 있었음.
-- 관리자(service_role)는 RLS를 우회하므로 이 정책과 무관하게 항상 삭제 가능.

DROP POLICY IF EXISTS "Users can delete own inquiries" ON public.inquiries;
CREATE POLICY "Users can delete own inquiries" ON public.inquiries
    FOR DELETE USING (auth.uid() = user_id);
