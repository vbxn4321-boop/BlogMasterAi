import { createClient } from '@supabase/supabase-js';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// service_role 키는 서버사이드에서만 사용 (클라이언트에 노출 안 됨)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST() {
    try {
        // 사용자 식별은 반드시 서버에서 세션(쿠키)으로 확인 — 클라이언트가 보낸 id는 절대 신뢰하지 않음
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // 구독 중이면 먼저 자동 해지 (기존 /api/billing/cancel 로직 재사용)
        const { data: subscription } = await supabaseAdmin
            .from('subscriptions')
            .select('status')
            .eq('user_id', user.id)
            .maybeSingle();

        if (subscription?.status === 'active') {
            const engineUrl = `${process.env.ENGINE_API_URL || 'http://localhost:4000'}/api/billing/cancel`;
            const cancelRes = await fetch(engineUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-engine-secret': process.env.ENGINE_API_SECRET,
                },
                body: JSON.stringify({ user_id: user.id }),
            });
            if (!cancelRes.ok) {
                return NextResponse.json({ error: '구독 취소 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
            }
        }

        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
