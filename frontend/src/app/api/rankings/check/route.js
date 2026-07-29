import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const engineUrl = `${process.env.ENGINE_API_URL || 'http://localhost:4000'}/api/rankings/check`;

        const response = await fetch(engineUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-engine-secret': process.env.ENGINE_API_SECRET
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!response.ok) return NextResponse.json(data, { status: response.status });
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
