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

async function requireAdmin() {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { data: profile } = await getSupabaseAdmin()
        .from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) throw new Error('관리자만 접근할 수 있습니다.');

    return user;
}

// 회원 상세 — 컴퍼니 개별 설정값 + 최근 결제 내역
export async function getMemberDetail(userId) {
    await requireAdmin();

    const [{ data: profile, error: profileErr }, { data: payments, error: paymentsErr }] = await Promise.all([
        getSupabaseAdmin()
            .from('profiles')
            .select('id, email, plan_type, override_price, override_max_naver_accounts, override_max_prompts, created_at')
            .eq('id', userId)
            .single(),
        getSupabaseAdmin()
            .from('subscription_payments')
            .select('id, amount, status, failure_reason, portone_payment_id, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20),
    ]);
    if (profileErr) throw new Error(toKoreanErrorMessage(profileErr));
    if (paymentsErr) throw new Error(toKoreanErrorMessage(paymentsErr));

    return { ...profile, payments: payments || [] };
}

// free -> company 전환 또는 이미 company인 회원의 개별 설정 수정.
// 3개 값 모두 필수 — 부분 설정을 허용하지 않는다(컴퍼니는 관리자가 계약 조건을 명확히
// 정해야만 강제 결제 모달에 정확한 금액을 띄울 수 있기 때문).
export async function setCompanyPlan(userId, { price, max_naver_accounts, max_prompts }) {
    await requireAdmin();

    const priceNum = Number(price);
    const maxAccNum = Number(max_naver_accounts);
    const maxPromptNum = Number(max_prompts);

    if (!Number.isFinite(priceNum) || priceNum <= 0) throw new Error('결제 금액은 0보다 큰 숫자여야 합니다.');
    if (!Number.isInteger(maxAccNum) || maxAccNum < 1) throw new Error('등록 가능 계정 수는 1 이상의 정수여야 합니다.');
    if (!Number.isInteger(maxPromptNum) || maxPromptNum < 0) throw new Error('등록 가능 프롬프트 수는 0 이상의 정수여야 합니다.');

    const { error } = await getSupabaseAdmin()
        .from('profiles')
        .update({
            plan_type: 'company',
            override_price: priceNum,
            override_max_naver_accounts: maxAccNum,
            override_max_prompts: maxPromptNum,
        })
        .eq('id', userId);
    if (error) throw new Error(toKoreanErrorMessage(error));
}
