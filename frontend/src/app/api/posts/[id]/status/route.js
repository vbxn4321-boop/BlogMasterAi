import { NextResponse } from 'next/server';

export async function GET(request) {
    try {
        const url = new URL(request.url);
        // Extracts the ID from the segment before '/status'
        // Path is /api/posts/[id]/status
        const segments = url.pathname.split('/');
        const idIdx = segments.indexOf('posts') + 1;
        const postId = segments[idIdx];

        if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

        const engineUrl = `${process.env.ENGINE_API_URL || 'http://localhost:4000'}/api/posts/${postId}/status`;

        const response = await fetch(engineUrl, {
            headers: {
                'Cache-Control': 'no-cache'
            },
            next: { revalidate: 0 } // Ensure no Next.js caching
        });

        if (!response.ok) {
            return NextResponse.json({ error: 'Failed to fetch status' }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (err) {
        console.error(`[Status API Proxy] Error connecting to Engine: ${err.message}`);
        // If engine is restarting or connection refused, return a temporary status instead of 500
        if (err.message.includes('ECONNREFUSED')) {
            return NextResponse.json({ status: 'restarting', message: '서버가 재시작 중입니다 잠시만 기다려주세요...' }, { status: 200 });
        }
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
