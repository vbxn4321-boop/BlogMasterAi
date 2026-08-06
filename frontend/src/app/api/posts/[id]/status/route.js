import { NextResponse } from 'next/server';

export async function GET(request, context) {
    try {
        const params = await context?.params;
        let postId = params?.id;

        if (!postId) {
            const url = new URL(request.url);
            const segments = url.pathname.split('/');
            const idIdx = segments.indexOf('posts') + 1;
            postId = segments[idIdx];
        }

        if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

        const baseUrl = process.env.ENGINE_API_URL || 'http://localhost:4000';
        const engineUrl = `${baseUrl}/api/posts/${postId}/status`;

        const response = await fetch(engineUrl, {
            headers: { 'Cache-Control': 'no-cache' },
            cache: 'no-store'
        });

        if (!response.ok) {
            return NextResponse.json({ error: 'Failed to fetch status' }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (err) {
        console.error(`[Status API Proxy] Error connecting to Engine: ${err.message}`);
        if (err.message?.includes('ECONNREFUSED')) {
            return NextResponse.json({ status: 'restarting', message: '서버가 재시작 중입니다 잠시만 기다려주세요...' }, { status: 200 });
        }
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
