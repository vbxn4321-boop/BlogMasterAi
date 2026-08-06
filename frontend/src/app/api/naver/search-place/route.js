import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const query = searchParams.get('query');
        if (!query) return NextResponse.json({ error: 'Query is required' }, { status: 400 });

        const engineUrl = `${process.env.ENGINE_API_URL || 'https://resplendent-endurance-production-ee32.up.railway.app'}/api/naver/search-place?query=${encodeURIComponent(query)}`;
        console.log(`[Search Route] Calling Engine: ${engineUrl}`);
        
        const response = await fetch(engineUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-engine-secret': process.env.ENGINE_API_SECRET
            }
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Naver search failed');
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (err) {
        console.error('[Search Route] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
