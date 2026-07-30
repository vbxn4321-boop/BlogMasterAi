"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// free 위에 베이직/프로/컴퍼니 3단계 유료 등급이 있다 — free만 아니면 구독 중으로 간주.
const PAID_PLAN_TYPES = ['basic', 'pro', 'company'];
// subscription_plans 테이블에 값이 없거나 조회 실패 시 폴백(기존 하드코딩 3개와 동일)
const FALLBACK_MAX_NAVER_ACCOUNTS = 3;

// 로그인한 사용자의 구독 여부를 profiles.plan_type('free' | 'basic' | 'pro' | 'company')로
// 판별하는 훅. 등급별 네이버 계정 등록 한도(maxNaverAccounts)도 함께 조회해서 반환한다.
// 조회 실패/컬럼 부재 등 어떤 경우에도 isSubscribed=false로 안전하게 폴백한다.
export function useSubscription() {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [planType, setPlanType] = useState(null);
    const [maxNaverAccounts, setMaxNaverAccounts] = useState(0);
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
                .select('plan_type, override_max_naver_accounts')
                .eq('id', user.id)
                .single();

            const plan = profile?.plan_type || null;
            setPlanType(plan);
            const subscribed = PAID_PLAN_TYPES.includes(plan);
            setIsSubscribed(subscribed);

            if (subscribed) {
                // 컴퍼니는 개별 계약값(override_max_naver_accounts)이 있으면 그걸 최우선으로 쓴다.
                if (plan === 'company' && profile?.override_max_naver_accounts != null) {
                    setMaxNaverAccounts(profile.override_max_naver_accounts);
                } else {
                    const { data: planRow } = await supabase
                        .from('subscription_plans')
                        .select('max_naver_accounts')
                        .eq('plan_key', plan)
                        .maybeSingle();
                    setMaxNaverAccounts(planRow?.max_naver_accounts ?? FALLBACK_MAX_NAVER_ACCOUNTS);
                }
            } else {
                setMaxNaverAccounts(0);
            }
            setLoading(false);
        };
        check();
    }, []);

    return { isSubscribed, planType, maxNaverAccounts, loading };
}
