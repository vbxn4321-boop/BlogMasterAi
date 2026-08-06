import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { billing_key_id, plan_key } = await req.json();
        if (!billing_key_id) return NextResponse.json({ error: 'billing_key_id required' }, { status: 400 });

        const engineUrl = `${process.env.ENGINE_API_URL || 'https://resplendent-endurance-production-ee32.up.railway.app'}/api/billing/subscribe`;

        // user_id는 클라이언트가 보낸 값이 아니라 서버에서 검증된 세션에서 가져온다 —
        // 다른 사람 명의로 구독을 걸 수 없도록 하는 핵심 지점. plan_key는 가격 결정에만 쓰이고
        // 실제 금액은 엔진 서버가 subscription_plans/profiles.override_price에서 다시 조회해 검증한다.
        const response = await fetch(engineUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-engine-secret': process.env.ENGINE_API_SECRET
            },
            body: JSON.stringify({ user_id: user.id, billing_key_id, plan_key })
        });

        const data = await response.json();
        if (!response.ok) return NextResponse.json(data, { status: response.status });
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
