import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const encoder = new TextEncoder();

function sseEvent(event, data) {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req) {
    const supabase = await createClient();

    const body = await req.json();
    const {
        topic, naver_account_id, category, trigger_type, reference_url,
        image_data, main_keyword, sub_keywords, min_volume, max_volume,
        custom_instructions, seo_category
    } = body;

    const stream = new ReadableStream({
        async start(controller) {
            try {
                // 진행 상황 알림
                controller.enqueue(sseEvent('chunk', { text: '' }));

                // 계정 정보 + 사용자 Gemini 키 조회
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

                const engineUrl = `${process.env.ENGINE_API_URL || 'http://localhost:4000'}/api/posts/preview`;
                console.log(`[Preview-Stream Route] Calling Engine: ${engineUrl} for trigger_type: ${trigger_type}`);

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
                    const text = await response.text();
                    let errMsg = 'Engine preview failed';
                    try { errMsg = JSON.parse(text).error || errMsg; } catch {}
                    throw new Error(errMsg);
                }

                const previewData = await response.json();

                // 최종 결과 전송
                controller.enqueue(sseEvent('done', previewData));

            } catch (err) {
                console.error('[Preview-Stream Route] Error:', err.message);
                controller.enqueue(sseEvent('error', { message: err.message }));
            } finally {
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        }
    });
}
