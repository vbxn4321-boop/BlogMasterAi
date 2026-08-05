import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { source_url } = await request.json();
        if (!source_url) return NextResponse.json({ error: 'source_url이 필요합니다.' }, { status: 400 });

        const engineUrl = process.env.ENGINE_API_URL || 'http://localhost:4000';
        const engineSecret = process.env.ENGINE_API_SECRET;

        const response = await fetch(`${engineUrl}/api/xhs/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-engine-secret': engineSecret },
            body: JSON.stringify({ user_id: user.id, source_url }),
        });

        if (!response.ok) {
            const text = await response.text();
            let errMsg = '작업 생성 실패';
            try { errMsg = JSON.parse(text).error || errMsg; } catch {}
            return NextResponse.json({ error: errMsg }, { status: response.status });
        }

        const result = await response.json();
        return NextResponse.json(result);

    } catch (err) {
        console.error('[XHS Jobs] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
