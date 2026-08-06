import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { keywords, options } = body;

        if (!keywords || !Array.isArray(keywords)) {
            return NextResponse.json({ error: 'Keywords array is required' }, { status: 400 });
        }

        const engineUrl = `${process.env.ENGINE_API_URL || 'https://resplendent-endurance-production-ee32.up.railway.app'}/api/keywords/trend`;

        const response = await fetch(engineUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-engine-secret': process.env.ENGINE_API_SECRET
            },
            body: JSON.stringify({ keywords, options })
        });

        if (!response.ok) {
            const text = await response.text();
            return NextResponse.json({
                error: `Engine responded with error (${response.status})`,
                details: text
            }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (err) {
        console.error('!!! [TREND API ERROR]:', err);
        return NextResponse.json({
            error: 'Internal Server Error',
            message: err.message
        }, { status: 500 });
    }
}
