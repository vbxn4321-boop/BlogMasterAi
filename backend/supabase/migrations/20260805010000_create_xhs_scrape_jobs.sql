CREATE TABLE IF NOT EXISTS public.xhs_scrape_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending_extension' CHECK (status IN (
        'pending_extension', 'processing', 'scraped', 'analyzing', 'ready', 'failed'
    )),
    device_id TEXT,
    caption_text TEXT,
    video_path TEXT,
    image_paths TEXT[] DEFAULT '{}',
    scenes JSONB,
    translated_script TEXT,
    product_name_guess TEXT,
    coupang_matches JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

ALTER TABLE public.xhs_scrape_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own xhs_scrape_jobs" ON public.xhs_scrape_jobs
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own xhs_scrape_jobs" ON public.xhs_scrape_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own xhs_scrape_jobs" ON public.xhs_scrape_jobs
    FOR UPDATE USING (auth.uid() = user_id);
