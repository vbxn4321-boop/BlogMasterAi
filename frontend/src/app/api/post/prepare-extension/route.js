import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { post_id, extension_device_id } = await request.json();

        if (!post_id) {
            return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
        }

        const engineUrl = process.env.ENGINE_API_URL || 'https://resplendent-endurance-production-ee32.up.railway.app';
        const engineSecret = process.env.ENGINE_API_SECRET || 'blog-master-secret-change-me';

        console.log(`[Frontend API] Preparing extension post: ${post_id}`);

        const response = await fetch(`${engineUrl}/api/extension/prepare`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-engine-secret': engineSecret
            },
            body: JSON.stringify({ post_id, extension_device_id: extension_device_id || null })
        });

        if (!response.ok) {
            const error = await response.json();
            return NextResponse.json({ error: error.error || 'Extension prepare failed' }, { status: response.status });
        }

        const result = await response.json();
        return NextResponse.json(result);

    } catch (err) {
        console.error('[Frontend API] Extension prepare error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
