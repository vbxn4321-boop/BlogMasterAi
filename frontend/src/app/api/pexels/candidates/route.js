import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { image_prompts } = await req.json();
        if (!Array.isArray(image_prompts) || image_prompts.length === 0) {
            return NextResponse.json({ error: 'image_prompts 배열이 필요합니다.' }, { status: 400 });
        }

        // 한글 번역을 위해 사용자 Gemini API 키 조회
        const { data: profile } = await supabase
            .from('profiles')
            .select('gemini_api_key')
            .eq('id', user.id)
            .single();

        const engineUrl = `${process.env.ENGINE_API_URL || 'https://resplendent-endurance-production-ee32.up.railway.app'}/api/pexels/candidates`;
        const response = await fetch(engineUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-engine-secret': process.env.ENGINE_API_SECRET
            },
            body: JSON.stringify({ image_prompts, gemini_api_key: profile?.gemini_api_key || null })
        });

        if (!response.ok) {
            const text = await response.text();
            return NextResponse.json({ error: `Engine error: ${text.slice(0, 100)}` }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (err) {
        console.error('[API/pexels/candidates] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
