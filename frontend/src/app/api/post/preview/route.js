import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const supabase = await createClient();

        const body = await req.json();
        const {
            topic, naver_account_id, category, trigger_type, reference_url,
            image_data, main_keyword, sub_keywords, min_volume, max_volume, custom_instructions, seo_category,
            _media_meta
        } = body;

        // 1. Fetch account-specific prompts + user's Gemini API key
        const { data: { user } } = await supabase.auth.getUser();
        const [{ data: account }, { data: profile }] = await Promise.all([
            supabase.from('naver_accounts').select('*').eq('id', naver_account_id).single(),
            supabase.from('profiles').select('gemini_api_key').eq('id', user?.id).single(),
        ]);

        let engineTopic = topic;
        if (trigger_type === 'url_reference') {
            engineTopic = reference_url;
        } else if (trigger_type === 'ai_recommend') {
            engineTopic = category;
        }

        // 2. Prepare data for checking Engine
        const engineUrl = `${process.env.ENGINE_API_URL || 'http://localhost:4000'}/api/posts/preview`;
        console.log(`[Preview Route] Calling Engine: ${engineUrl} for trigger_type: ${trigger_type}`);
        
        const response = await fetch(engineUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-engine-secret': process.env.ENGINE_API_SECRET
            },
            body: JSON.stringify({
                topic: engineTopic,
                image_data,
                reference_url,
                _media_meta,
                trigger_type,
                category,
                main_keyword,
                sub_keywords,
                min_volume,
                max_volume,
                custom_instructions,
                seo_category,
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
            const err = await response.json();
            throw new Error(err.error || 'Engine preview failed');
        }

        const previewData = await response.json();
        return NextResponse.json(previewData);

    } catch (err) {
        console.error('[Preview Route] Full Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
