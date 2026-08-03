'use server';

import { createClient as createServerSupabaseClient } from './supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { toKoreanErrorMessage } from './errorMessage';

const DEFAULT_SUPABASE_URL = 'https://nozklukqqjgrebufgpoq.supabase.co';

function getSupabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-key-for-build';
    return createServiceClient(url, key);
}

const PLAN_ORDER = ['basic', 'pro', 'company'];

async function requireAdmin() {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { data: profile } = await getSupabaseAdmin()
        .from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) throw new Error('관리자만 접근할 수 있습니다.');

    return user;
}

// 요금제 탭 — 현재 DB의 전체 플랜 리스트 조회 (PLAN_ORDER 순 정렬)
export async function listSubscriptionPlans() {
    await requireAdmin();

    const { data, error } = await getSupabaseAdmin()
        .from('subscription_plans')
        .select('*');
    if (error) throw new Error(toKoreanErrorMessage(error));

    const plans = data || [];
    plans.sort((a, b) => {
        const ia = PLAN_ORDER.indexOf(a.id);
        const ib = PLAN_ORDER.indexOf(b.id);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return plans;
}

// 요금제 수정 — basic/pro/company 개별 행 업데이트
export async function updateSubscriptionPlan(planId, { price_monthly, max_naver_accounts, max_prompts }) {
    await requireAdmin();

    if (!PLAN_ORDER.includes(planId)) throw new Error('올바르지 않은 플랜입니다.');

    const price = Number(price_monthly);
    const maxAcc = Number(max_naver_accounts);
    const maxPrompt = Number(max_prompts);

    if (!Number.isFinite(price) || price < 0) throw new Error('월 가격은 0 이상의 숫자여야 합니다.');
    if (!Number.isInteger(maxAcc) || maxAcc < 1) throw new Error('등록 가능 계정 수는 1 이상의 정수여야 합니다.');
    if (!Number.isInteger(maxPrompt) || maxPrompt < 0) throw new Error('등록 가능 프롬프트 수는 0 이상의 정수여야 합니다.');

    const { error } = await getSupabaseAdmin()
        .from('subscription_plans')
        .update({
            price_monthly: price,
            max_naver_accounts: maxAcc,
            max_prompts: maxPrompt,
            updated_at: new Date().toISOString(),
        })
        .eq('id', planId);
    if (error) throw new Error(toKoreanErrorMessage(error));
}
