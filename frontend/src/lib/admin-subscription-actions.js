'use server';

import { createClient as createServerSupabaseClient } from './supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { toKoreanErrorMessage } from './errorMessage';

// service_role 키로 RLS를 우회해 관리자가 subscription_plans를 수정할 수 있게 한다.
// 쓰기 전에 반드시 requireAdmin()으로 호출자가 실제 관리자인지 검증한다.
const supabaseAdmin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PLAN_ORDER = ['basic', 'pro', 'company'];

async function requireAdmin() {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { data: profile } = await supabaseAdmin
        .from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) throw new Error('관리자만 접근할 수 있습니다.');

    return user;
}

// 구독 관리 페이지 — 베이직/프로/컴퍼니 3단계 설정 조회
export async function listSubscriptionPlans() {
    await requireAdmin();

    const { data, error } = await supabaseAdmin
        .from('subscription_plans')
        .select('plan_key, display_name, price, max_naver_accounts, max_prompts, updated_at');
    if (error) throw new Error(toKoreanErrorMessage(error));

    const byKey = Object.fromEntries((data || []).map(row => [row.plan_key, row]));
    // 항상 베이직 → 프로 → 컴퍼니 고정 순서로 반환 (행이 누락돼 있어도 화면이 깨지지 않도록 방어)
    return PLAN_ORDER.map(key => byKey[key] || { plan_key: key, display_name: key, price: 0, max_naver_accounts: 0, max_prompts: null });
}

// 등급 하나의 가격/계정 한도/프롬프트 한도 수정.
// price는 다음 결제 주기부터 반영된다 — 이미 청구된 이번 회차는 그대로 두고,
// scheduler.js의 runSubscriptionBilling()이 매 회차마다 이 값을 새로 조회해서 청구하기 때문.
export async function updateSubscriptionPlan(planKey, { price, max_naver_accounts, max_prompts }) {
    await requireAdmin();

    if (!PLAN_ORDER.includes(planKey)) throw new Error('알 수 없는 요금제입니다.');

    const priceNum = Number(price);
    const maxAccNum = Number(max_naver_accounts);
    const maxPromptNum = max_prompts === '' || max_prompts === null || max_prompts === undefined ? null : Number(max_prompts);

    if (!Number.isFinite(priceNum) || priceNum < 0) throw new Error('가격은 0 이상의 숫자여야 합니다.');
    if (!Number.isInteger(maxAccNum) || maxAccNum < 1) throw new Error('등록 가능 계정 수는 1 이상의 정수여야 합니다.');
    if (maxPromptNum !== null && (!Number.isInteger(maxPromptNum) || maxPromptNum < 0)) throw new Error('등록 가능 프롬프트 수는 0 이상의 정수여야 합니다.');

    const { error } = await supabaseAdmin
        .from('subscription_plans')
        .update({
            price: priceNum,
            max_naver_accounts: maxAccNum,
            max_prompts: maxPromptNum,
            updated_at: new Date().toISOString(),
        })
        .eq('plan_key', planKey);
    if (error) throw new Error(toKoreanErrorMessage(error));
}
