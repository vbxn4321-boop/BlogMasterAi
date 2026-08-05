import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const formData = await request.formData();
        const productName = formData.get('product_name');
        const emphasisText = formData.get('emphasis_text');
        const media = formData.get('media');

        if (!media || !productName || !emphasisText) {
            return NextResponse.json({ error: '상품명, 강조 멘트, 미디어 파일을 모두 입력해주세요.' }, { status: 400 });
        }

        const engineUrl = process.env.SHORTS_ENGINE_URL || 'http://localhost:8001';

        const proxyForm = new FormData();
        proxyForm.set('media', media, media.name);
        proxyForm.set('product_name', productName);
        proxyForm.set('emphasis_text', emphasisText);

        const response = await fetch(`${engineUrl}/api/shorts/manual`, {
            method: 'POST',
            body: proxyForm,
        });

        if (!response.ok) {
            const text = await response.text();
            let errMsg = '쇼츠 생성 실패';
            try { errMsg = JSON.parse(text).detail || errMsg; } catch {}
            return NextResponse.json({ error: errMsg }, { status: response.status });
        }

        const result = await response.json();

        await supabase.from('shorts_jobs').insert({
            user_id: user.id,
            source_tab: 'manual_upload',
            product_name: productName,
            emphasis_text: emphasisText,
            script: result.script,
            subtitle_srt: result.subtitle_srt,
            video_path: result.video_url,
            duration_sec: result.duration_sec,
            status: 'completed',
        });

        return NextResponse.json({
            ...result,
            video_url: `${engineUrl}${result.video_url}`,
        });

    } catch (err) {
        console.error('[Shorts Manual] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
