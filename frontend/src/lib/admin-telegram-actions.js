'use server';

import { createClient as createServerSupabaseClient } from './supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { toKoreanErrorMessage } from './errorMessage';

// service_role 키는 서버에서만 사용 — RLS(auth.uid()=user_id)를 우회해서 관리자가
// 다른 회원의 telegram_schedule_settings 행을 읽고 쓸 수 있게 한다.
// 대신 아래 requireAdmin()으로 호출자가 실제 관리자인지 먼저 검증한다.
const supabaseAdmin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireAdmin() {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { data: profile } = await supabaseAdmin
        .from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) throw new Error('관리자만 접근할 수 있습니다.');

    return user;
}

// 회원 관리 페이지 — 전체 회원 목록 + 네이버 계정 수
export async function listMembers() {
    await requireAdmin();

    const { data: profiles, error } = await supabaseAdmin
        .from('profiles')
        .select('id, email, plan_type, telegram_chat_id, created_at')
        .order('created_at', { ascending: false });
    if (error) throw new Error(toKoreanErrorMessage(error));

    const { data: accountRows } = await supabaseAdmin.from('naver_accounts').select('user_id');
    const countMap = {};
    (accountRows || []).forEach(a => { countMap[a.user_id] = (countMap[a.user_id] || 0) + 1; });

    return (profiles || []).map(p => ({ ...p, naver_account_count: countMap[p.id] || 0 }));
}

// 자동화 페이지 — 회원별 설정 탭의 회원 선택 드롭다운용 (연동 여부 상관없이 전체)
export async function listMembersForAutomation() {
    await requireAdmin();

    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('id, email')
        .order('email', { ascending: true });
    if (error) throw new Error(toKoreanErrorMessage(error));
    return data || [];
}

// 특정 회원의 네이버 계정 목록 + 기존 텔레그램 스케줄 설정(없으면 null) + 슬롯 목록
export async function getMemberAutomationData(userId) {
    await requireAdmin();

    const [{ data: accounts, error: accErr }, { data: settings, error: setErr }, { data: slots, error: slotErr }] = await Promise.all([
        supabaseAdmin.from('naver_accounts').select('id, naver_id, concept').eq('user_id', userId),
        supabaseAdmin.from('telegram_schedule_settings').select('*').eq('user_id', userId).maybeSingle(),
        supabaseAdmin.from('telegram_schedule_slots').select('*').eq('user_id', userId).order('time'),
    ]);
    if (accErr) throw new Error(toKoreanErrorMessage(accErr));
    if (setErr) throw new Error(toKoreanErrorMessage(setErr));
    if (slotErr) throw new Error(toKoreanErrorMessage(slotErr));

    return { accounts: accounts || [], settings: settings || null, slots: slots || [] };
}

/**
 * 슬롯 목록을 통째로 교체한다. 먼저 새 슬롯을 INSERT한 뒤 기존 슬롯을 DELETE하는 순서로
 * 처리한다 — 반대로(DELETE 먼저) 하면 INSERT가 중간에 실패했을 때 그 사용자의 슬롯이
 * 통째로 사라지는 실패 모드가 생기기 때문. insert-then-delete면 실패해도 기존 슬롯이
 * 그대로 남아있어서 최소한 무해하다.
 */
async function replaceSlots(userId, slots) {
    const { data: oldSlots } = await supabaseAdmin.from('telegram_schedule_slots').select('id').eq('user_id', userId);
    const oldIds = (oldSlots || []).map(s => s.id);

    if (slots?.length) {
        const rows = slots.map(s => ({
            user_id: userId, mode: s.mode, enabled: s.enabled, time: s.time, message_template: s.message_template,
        }));
        const { error: insErr } = await supabaseAdmin.from('telegram_schedule_slots').insert(rows);
        if (insErr) throw new Error(toKoreanErrorMessage(insErr));
    }

    if (oldIds.length) {
        const { error: delErr } = await supabaseAdmin.from('telegram_schedule_slots').delete().in('id', oldIds);
        if (delErr) throw new Error(toKoreanErrorMessage(delErr));
    }
}

export async function saveMemberTelegramSettings(userId, { naver_account_id, default_tone, default_category, default_custom_instructions, default_image_source, slots }) {
    await requireAdmin();

    const { error } = await supabaseAdmin
        .from('telegram_schedule_settings')
        .upsert({ user_id: userId, naver_account_id, default_tone, default_category, default_custom_instructions, default_image_source }, { onConflict: 'user_id' });
    if (error) throw new Error(toKoreanErrorMessage(error));

    await replaceSlots(userId, slots);
}

/**
 * 텔레그램 연동된 회원 전체에게 공통 필드(톤/카테고리/요청사항/슬롯 목록)를 일괄 적용.
 * naver_account_id는 회원마다 다르므로 전체 공통으로 못 미친다 — 이미 설정이 있으면 그 회원의
 * 기존 naver_account_id를 보존하고, 없으면 그 회원의 첫 번째 네이버 계정으로 채운다.
 * 네이버 계정 자체가 없는 회원은 추천할 대상이 없으므로 건너뛴다.
 */
export async function applyCommonTelegramSettingsToAll({ default_tone, default_category, default_custom_instructions, default_image_source, slots }) {
    await requireAdmin();

    const { data: linkedProfiles, error } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .not('telegram_chat_id', 'is', null);
    if (error) throw new Error(toKoreanErrorMessage(error));
    if (!linkedProfiles?.length) return { applied: 0, skipped: 0 };

    let applied = 0, skipped = 0;
    for (const profile of linkedProfiles) {
        const [{ data: existing }, { data: firstAccount }] = await Promise.all([
            supabaseAdmin.from('telegram_schedule_settings').select('naver_account_id').eq('user_id', profile.id).maybeSingle(),
            supabaseAdmin.from('naver_accounts').select('id').eq('user_id', profile.id).limit(1).maybeSingle(),
        ]);
        const naverAccountId = existing?.naver_account_id || firstAccount?.id;
        if (!naverAccountId) { skipped++; continue; }

        const { error: upsertErr } = await supabaseAdmin
            .from('telegram_schedule_settings')
            .upsert({ user_id: profile.id, naver_account_id: naverAccountId, default_tone, default_category, default_custom_instructions, default_image_source }, { onConflict: 'user_id' });
        if (upsertErr) { skipped++; continue; }

        try {
            await replaceSlots(profile.id, slots);
        } catch (_) { skipped++; continue; }
        applied++;
    }

    return { applied, skipped };
}
