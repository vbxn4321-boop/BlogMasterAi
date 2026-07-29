import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { post_id } = await request.json();

        if (!post_id) {
            return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
        }

        const engineUrl = process.env.ENGINE_API_URL || 'http://localhost:4000';
        const engineSecret = process.env.ENGINE_API_SECRET;

        console.log(`[Frontend API] Triggering engine for post: ${post_id}`);

        const response = await fetch(`${engineUrl}/api/posts/trigger`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-engine-secret': engineSecret
            },
            body: JSON.stringify({ post_id })
        });

        if (!response.ok) {
            const error = await response.json();
            return NextResponse.json({ error: error.error || 'Engine trigger failed' }, { status: response.status });
        }

        const result = await response.json();
        return NextResponse.json(result);

    } catch (err) {
        console.error('[Frontend API] Trigger error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
