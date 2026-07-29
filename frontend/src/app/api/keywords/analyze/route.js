import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { KEYWORD_SEARCH_TRIAL_LIMIT, KEYWORD_SEARCH_FEATURE } from '@/lib/trial';

export async function POST(req) {
    console.log('\n>>> [API/KEYWORDS/ANALYZE] POST START - Time:', new Date().toISOString());
    console.log(' - URL:', req.url);
    console.log(' - Method:', req.method);
    try {
        console.log('1. Checking Auth...');
        const supabase = await createClient();
        console.log(' - Supabase client created');
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError) {
            console.error(' - Auth Error:', authError);
            return NextResponse.json({ error: 'Auth Error: ' + authError.message }, { status: 401 });
        }

        if (!user) {
            console.warn(' - No user found');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.log(' - User authenticated:', user.email);

        console.log('2. Parsing Body...');
        const body = await req.json();
        const { keyword } = body;
        console.log(' - Keyword:', keyword);

        if (!keyword) {
            return NextResponse.json({ error: 'Keyword is required' }, { status: 400 });
        }

        // 사용자 Gemini API 키 + 구독 플랜 조회
        const { data: profile } = await supabase
            .from('profiles')
            .select('gemini_api_key, plan_type')
            .eq('id', user.id)
            .single();
        const gemini_api_key = profile?.gemini_api_key || null;
        const isSubscribed = profile?.plan_type === 'pro';

        // 비구독 사용자: 체험 검색 횟수 제한 (usage_logs 기반, 서버에서 강제해 우회 불가)
        if (!isSubscribed) {
            const { count } = await supabase
                .from('usage_logs')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('feature', KEYWORD_SEARCH_FEATURE);

            if ((count || 0) >= KEYWORD_SEARCH_TRIAL_LIMIT) {
                return NextResponse.json({
                    error: '무료 체험 검색 횟수를 모두 사용했습니다. 구독 후 이용해 주세요.',
                    code: 'TRIAL_LIMIT_REACHED'
                }, { status: 403 });
            }
        }

        const engineUrl = `${process.env.ENGINE_API_URL || 'http://localhost:4000'}/api/keywords/analyze`;
        console.log('3. Fetching from Engine:', engineUrl);

        const response = await fetch(engineUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-engine-secret': process.env.ENGINE_API_SECRET
            },
            body: JSON.stringify({ keyword, gemini_api_key })
        });

        console.log('4. Engine responded with status:', response.status);
        const contentType = response.headers.get('content-type');
        console.log(' - Content-Type:', contentType);

        if (!response.ok) {
            const text = await response.text();
            console.error(' - Engine Error Body:', text.slice(0, 200));
            return NextResponse.json({
                error: `Engine responded with error (${response.status})`,
                details: text.slice(0, 100)
            }, { status: response.status });
        }

        const data = await response.json();
        console.log('5. Success! Returning data.');

        // 비구독 사용자의 체험 검색 1회 사용 기록 (best-effort — 실패해도 응답은 그대로 반환)
        if (!isSubscribed) {
            supabase.from('usage_logs').insert({ user_id: user.id, feature: KEYWORD_SEARCH_FEATURE })
                .then(({ error }) => { if (error) console.error(' - usage_logs insert failed:', error.message); });
        }

        return NextResponse.json(data);

    } catch (err) {
        console.error('!!! [API ERROR]:', err);
        let status = 500;
        let errorMessage = 'Internal Server Error';
        
        if (err.code === 'ECONNREFUSED') {
            status = 503;
            errorMessage = '엔진 서버에 연결할 수 없습니다. 관리자에게 문의하세요.';
        }

        return NextResponse.json({
            error: errorMessage,
            message: err.message,
            code: err.code
        }, { status });
    }
}

export async function GET() {
    return NextResponse.json({ message: 'Keyword Analysis API is active. Use POST to analyze.' });
}
