import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { history } = await req.json();
        if (!Array.isArray(history) || history.length === 0) {
            return NextResponse.json({ error: 'history required' }, { status: 400 });
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('gemini_api_key')
            .eq('id', user.id)
            .single();

        if (!profile?.gemini_api_key) {
            return NextResponse.json({ error: '제미나이 API 키가 등록되지 않았습니다. 설정 > 프로필에서 Gemini API 키를 먼저 등록해주세요.' }, { status: 400 });
        }

        const engineUrl = `${process.env.ENGINE_API_URL || 'https://resplendent-endurance-production-ee32.up.railway.app'}/api/keywords/chat-suggest`;
        const response = await fetch(engineUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-engine-secret': process.env.ENGINE_API_SECRET,
            },
            body: JSON.stringify({ history, gemini_api_key: profile.gemini_api_key }),
        });

        const data = await response.json();
        if (!response.ok) {
            return NextResponse.json({ error: data.error || '키워드 추천에 실패했습니다.' }, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (err) {
        console.error('[Keyword Chat] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
