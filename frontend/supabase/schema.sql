-- ============================================================
-- Blog Master AI: Database Schema
-- Run this in Supabase SQL Editor to create all tables
-- ============================================================

-- 1. Users (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'pro')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Naver Accounts (max 3 per user)
CREATE TABLE IF NOT EXISTS public.naver_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    naver_id TEXT NOT NULL,
    encrypted_password TEXT,
    concept TEXT DEFAULT '일상' CHECK (concept IN ('일상', '전문가', '리뷰')),
    session_cookies JSONB DEFAULT '{}',
    browser_profile_path TEXT,
    is_session_valid BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, naver_id)
);

-- Enforce max 3 accounts per user
CREATE OR REPLACE FUNCTION check_max_naver_accounts()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM public.naver_accounts WHERE user_id = NEW.user_id) >= 3 THEN
        RAISE EXCEPTION 'Maximum of 3 Naver accounts per user allowed.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_max_naver_accounts
    BEFORE INSERT ON public.naver_accounts
    FOR EACH ROW EXECUTE FUNCTION check_max_naver_accounts();

-- 3. Posts
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    naver_account_id UUID NOT NULL REFERENCES public.naver_accounts(id) ON DELETE CASCADE,
    trigger_type TEXT DEFAULT 'manual' CHECK (trigger_type IN ('ai_recommend', 'manual', 'url_reference', 'image_reference')),
    topic TEXT,
    reference_url TEXT,
    category TEXT DEFAULT '일상',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'generating', 'posting', 'success', 'failed')),
    content_json JSONB DEFAULT '{}',
    image_paths TEXT[] DEFAULT '{}',
    naver_post_url TEXT,
    error_message TEXT,
    scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Rankings (SEO Tracking)
CREATE TABLE IF NOT EXISTS public.rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    rank_position INTEGER,
    search_page INTEGER,
    total_results INTEGER,
    checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient ranking queries
CREATE INDEX IF NOT EXISTS idx_rankings_post_keyword ON public.rankings(post_id, keyword, checked_at DESC);

-- 5. Prompt Vault (Admin Only)
CREATE TABLE IF NOT EXISTS public.prompt_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    content_prompt TEXT NOT NULL,
    image_prompt TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.naver_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_vault ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can only access their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Naver Accounts: Users can only manage their own accounts
CREATE POLICY "Users can view own naver_accounts" ON public.naver_accounts
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own naver_accounts" ON public.naver_accounts
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own naver_accounts" ON public.naver_accounts
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own naver_accounts" ON public.naver_accounts
    FOR DELETE USING (auth.uid() = user_id);

-- Posts: Users can only access their own posts
CREATE POLICY "Users can view own posts" ON public.posts
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own posts" ON public.posts
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON public.posts
    FOR UPDATE USING (auth.uid() = user_id);

-- Rankings: Users can view rankings for their posts
CREATE POLICY "Users can view own rankings" ON public.rankings
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.posts WHERE posts.id = rankings.post_id AND posts.user_id = auth.uid())
    );

-- Prompt Vault: Admin only (no user access)
-- Engine accesses this via service_role key (bypasses RLS)

-- ============================================================
-- Auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
