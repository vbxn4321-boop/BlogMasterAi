-- ============================================================
-- 작성 세부 요청사항 프리셋 (네이버 계정별 즐겨찾기)
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.custom_instruction_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    naver_account_id UUID NOT NULL REFERENCES public.naver_accounts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_instruction_presets_account
    ON public.custom_instruction_presets(naver_account_id, created_at DESC);

ALTER TABLE public.custom_instruction_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own custom_instruction_presets" ON public.custom_instruction_presets
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own custom_instruction_presets" ON public.custom_instruction_presets
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own custom_instruction_presets" ON public.custom_instruction_presets
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own custom_instruction_presets" ON public.custom_instruction_presets
    FOR DELETE USING (auth.uid() = user_id);
