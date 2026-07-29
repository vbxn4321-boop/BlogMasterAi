"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// 로그인한 사용자의 구독 여부를 profiles.plan_type('free' | 'pro')로 판별하는 훅.
// 조회 실패/컬럼 부재 등 어떤 경우에도 isSubscribed=false로 안전하게 폴백한다.
export function useSubscription() {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const supabase = createClient();
        const check = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setLoading(false);
                return;
            }
            const { data: profile } = await supabase
                .from('profiles')
                .select('plan_type')
                .eq('id', user.id)
                .single();

            setIsSubscribed(profile?.plan_type === 'pro');
            setLoading(false);
        };
        check();
    }, []);

    return { isSubscribed, loading };
}
