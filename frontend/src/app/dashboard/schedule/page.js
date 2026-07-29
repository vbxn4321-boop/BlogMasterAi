// ════════════════════════════════════════
// 예약 관리 탭 — 비활성화됨
// 아래 원본 코드는 주석 처리되어 있습니다.
// 재활성화하려면 주석을 해제하고 layout.js의 navItems에서 해당 항목도 주석 해제하세요.
// ════════════════════════════════════════

export default function SchedulePage() {
    return null;
}

/*
export const dynamic = 'force-dynamic';

import { createClient } from "@/lib/supabase/server";
import ScheduleClient from "./ScheduleClient";

export default async function SchedulePage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch scheduled and pending posts
    const { data: scheduledPosts } = await supabase
        .from('posts')
        .select(`
            id,
            topic,
            status,
            scheduled_at,
            created_at,
            naver_accounts ( naver_id, concept )
        `)
        .eq('user_id', user?.id)
        .in('status', ['pending', 'scheduled'])
        .order('scheduled_at', { ascending: true, nullsFirst: false });

    return <ScheduleClient initialPosts={scheduledPosts || []} />;
}
*/
