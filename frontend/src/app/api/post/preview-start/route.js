import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { naver_account_id } = body;

        const [{ data: account }, { data: profile }] = await Promise.all([
            supabase.from('naver_accounts').select('*').eq('id', naver_account_id).single(),
            supabase.from('profiles').select('gemini_api_key').eq('id', user.id).single(),
        ]);

        let engineTopic = body.topic;
        if (body.trigger_type === 'url_reference') engineTopic = body.reference_url;
        else if (body.trigger_type === 'ai_recommend') {
            engineTopic = body.category;
        }

        const engineUrl = `${process.env.ENGINE_API_URL || 'https://resplendent-endurance-production-ee32.up.railway.app'}/api/posts/preview-async`;

        const response = await fetch(engineUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-engine-secret': process.env.ENGINE_API_SECRET
            },
            body: JSON.stringify({
                ...body,
                topic: engineTopic,
                gemini_api_key: profile?.gemini_api_key || null,
                account_prompts: account ? {
                    content_prompt: account.custom_content_prompt,
                    image_prompt: account.custom_image_prompt,
                    thumbnail_prompt: account.custom_thumbnail_prompt,
                    formatting_prompt: account.custom_formatting_prompt,
                    tone_key: account.tone_key,
                    custom_image_reference_v2_prompt: account.custom_image_reference_v2_prompt,
                    image_reference_prompt: account.image_reference_prompt,
                    business: {
                        phone: account.biz_phone,
                        kakao_id: account.biz_kakao_id,
                        kakao_url: account.biz_kakao_url,
                        map_address: account.biz_map_address,
                        cta_image_url: account.biz_cta_image_url,
                        footer_text: account.biz_footer_text,
                        image_links: account.biz_image_links || {},
                        footer_components: account.biz_footer_components || []
                    }
                } : null
            })
        });

        if (!response.ok) {
            const text = await response.text();
            let errMsg = '원고 생성 시작 실패';
            try { errMsg = JSON.parse(text).error || errMsg; } catch {}
            throw new Error(errMsg);
        }

        const { preview_id } = await response.json();
        return NextResponse.json({ preview_id });

    } catch (err) {
        console.error('[Preview Start] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
