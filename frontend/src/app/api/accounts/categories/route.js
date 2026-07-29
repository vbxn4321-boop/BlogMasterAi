import { NextResponse } from 'next/server';

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const accountId = searchParams.get('accountId');

        if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

        const engineUrl = `${process.env.ENGINE_API_URL || 'http://localhost:4000'}/api/accounts/${accountId}/categories`;
        const authKey = process.env.ENGINE_API_SECRET;

        const response = await fetch(engineUrl, {
            headers: { 'x-engine-secret': authKey }
        });

        const data = await response.json();
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
