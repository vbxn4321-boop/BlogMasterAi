import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { keyword } = await req.json();
        if (!keyword) return NextResponse.json({ error: 'keyword required' }, { status: 400 });

        // 사용자의 네이버 계정 블로그 ID 목록 조회
        const { data: accounts } = await supabase
            .from('naver_accounts')
            .select('naver_id')
            .eq('user_id', user.id);

        const blogIds = (accounts || []).map(a => a.naver_id.trim().split('@')[0]);
        if (blogIds.length === 0) {
            return NextResponse.json({ keyword, results: [], total: 0 });
        }

        const engineUrl = `${process.env.ENGINE_API_URL || 'https://resplendent-endurance-production-ee32.up.railway.app'}/api/rankings/keyword-search`;

        const response = await fetch(engineUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-engine-secret': process.env.ENGINE_API_SECRET
            },
            body: JSON.stringify({ keyword, blog_ids: blogIds })
        });

        const data = await response.json();
        if (!response.ok) return NextResponse.json(data, { status: response.status });
        return NextResponse.json(data);

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
