CREATE TABLE IF NOT EXISTS public.shorts_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    source_tab TEXT NOT NULL DEFAULT 'manual_upload',
    product_name TEXT,
    emphasis_text TEXT,
    script TEXT,
    subtitle_srt TEXT,
    video_path TEXT,
    duration_sec NUMERIC,
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.shorts_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shorts_jobs" ON public.shorts_jobs
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own shorts_jobs" ON public.shorts_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
