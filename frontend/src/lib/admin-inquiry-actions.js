'use server';

import { createClient as createServerSupabaseClient } from './supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { toKoreanErrorMessage } from './errorMessage';

// service_role 키로 RLS를 우회해 관리자가 전체 회원의 문의를 읽고 답변할 수 있게 한다.
// 쓰기 전에 반드시 requireAdmin()으로 호출자가 실제 관리자인지 검증한다.
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

// 문의 탭 — 전체 문의 목록 (누가/언제/내용 미리보기/답변완료 여부)
export async function listInquiries() {
    await requireAdmin();

    const { data: inquiries, error } = await supabaseAdmin
        .from('inquiries')
        .select('id, user_id, message, status, created_at, replied_at')
        .order('created_at', { ascending: false });
    if (error) throw new Error(toKoreanErrorMessage(error));

    const userIds = [...new Set((inquiries || []).map(i => i.user_id))];
    const { data: profiles } = userIds.length
        ? await supabaseAdmin.from('profiles').select('id, email').in('id', userIds)
        : { data: [] };
    const emailById = Object.fromEntries((profiles || []).map(p => [p.id, p.email]));

    return (inquiries || []).map(i => ({ ...i, user_email: emailById[i.user_id] || '알 수 없음' }));
}

// 문의 상세 — 전체 내용 + 작성자 이메일
export async function getInquiry(id) {
    await requireAdmin();

    const { data: inquiry, error } = await supabaseAdmin
        .from('inquiries')
        .select('id, user_id, message, status, admin_reply, replied_at, created_at')
        .eq('id', id)
        .single();
    if (error) throw new Error(toKoreanErrorMessage(error));

    const { data: profile } = await supabaseAdmin
        .from('profiles').select('email').eq('id', inquiry.user_id).single();

    return { ...inquiry, user_email: profile?.email || '알 수 없음' };
}

// 답변 작성 — 답변 내용을 저장하고 상태를 answered로 전환.
// user_read_at은 건드리지 않는다 — 사용자가 "받은 메세지"를 직접 열어봐야 읽음 처리되고,
// 그래야 플로팅 아이콘의 빨간 점이 "새 답변 옴"을 정확히 반영한다.
export async function replyToInquiry(id, replyText) {
    const admin = await requireAdmin();

    const trimmed = (replyText || '').trim();
    if (!trimmed) throw new Error('답변 내용을 입력해주세요.');

    const { error } = await supabaseAdmin
        .from('inquiries')
        .update({
            admin_reply: trimmed,
            status: 'answered',
            replied_at: new Date().toISOString(),
            replied_by: admin.id,
        })
        .eq('id', id);
    if (error) throw new Error(toKoreanErrorMessage(error));
}

// 문의 삭제 — 목록/상세 화면 둘 다에서 호출
export async function deleteInquiry(id) {
    await requireAdmin();

    const { error } = await supabaseAdmin.from('inquiries').delete().eq('id', id);
    if (error) throw new Error(toKoreanErrorMessage(error));
}
