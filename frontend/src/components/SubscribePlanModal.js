'use client';

import { useState, useEffect } from 'react';
import * as PortOne from '@portone/browser-sdk/v2';
import { createClient } from '@/lib/supabase/client';
import { toKoreanErrorMessage } from '@/lib/errorMessage';
import { Modal, InlineAlert } from '@/components/ui';

const PLAN_LABELS = { basic: '베이직', pro: '프로', company: '컴퍼니' };
const PLAN_ORDER = ['basic', 'pro', 'company'];

// 일반 사용자의 요금제 선택 모달. 베이직/프로는 그 자리에서 결제(PortOne 빌링키 등록)까지
// 진행되고, 컴퍼니는 사용량에 따라 개별 협의가 필요해 결제 버튼 대신 관리자 문의 이메일만 보여준다.
// 가격/한도는 subscription_plans를 실시간 조회 — 관리자가 /admin/subscriptions에서 바꾸면
// 재배포 없이 바로 이 모달에도 반영된다.
export default function SubscribePlanModal({ open, onClose, onSubscribed }) {
    const [plans, setPlans] = useState(null);
    const [error, setError] = useState('');
    const [agreed, setAgreed] = useState(false);
    const [subscribingKey, setSubscribingKey] = useState(null);

    useEffect(() => {
        if (!open) return;
        setError('');
        setPlans(null);
        const supabase = createClient();
        supabase
            .from('subscription_plans')
            .select('plan_key, display_name, price, max_naver_accounts, max_prompts')
            .then(({ data, error: fetchErr }) => {
                if (fetchErr) { setError(toKoreanErrorMessage(fetchErr)); return; }
                const byKey = Object.fromEntries((data || []).map(p => [p.plan_key, p]));
                setPlans(PLAN_ORDER.map(k => byKey[k]).filter(Boolean));
            });
    }, [open]);

    const handleSubscribe = async (planKey) => {
        if (!agreed) {
            setError('정기결제 및 자동갱신 안내에 동의해주세요.');
            return;
        }
        setError('');
        setSubscribingKey(planKey);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            const issueResponse = await PortOne.requestIssueBillingKey({
                storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID,
                channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY,
                billingKeyMethod: 'CARD',
                issueId: `issue_${user.id}_${Date.now()}`,
                issueName: `${PLAN_LABELS[planKey] || planKey} 플랜 정기결제 카드 등록`,
                customer: { customerId: user.id, email: user.email || undefined },
            });

            if (!issueResponse || issueResponse.code) {
                throw new Error(issueResponse?.message || '카드 등록이 취소되었거나 실패했습니다.');
            }

            const res = await fetch('/api/billing/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ billing_key_id: issueResponse.billingKey, plan_key: planKey }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '구독 처리에 실패했습니다.');

            onSubscribed?.();
        } catch (err) {
            setError(toKoreanErrorMessage(err, '카드 등록에 실패했습니다. 카드 정보를 확인하고 다시 시도해주세요.'));
        } finally {
            setSubscribingKey(null);
        }
    };

    const contactEmail = process.env.NEXT_PUBLIC_ADMIN_CONTACT_EMAIL;

    return (
        <Modal open={open} onClose={onClose} width={860}>
            <button
                onClick={onClose}
                style={{
                    position: 'absolute', top: 18, right: 18, background: 'none', border: 'none',
                    fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)',
                }}
            >
                ✕
            </button>

            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>요금제 선택</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                이용 규모에 맞는 요금제를 선택해주세요.
            </p>

            {error && (
                <div style={{ marginBottom: 16 }}>
                    <InlineAlert type="error">{error}</InlineAlert>
                </div>
            )}

            {!plans ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>불러오는 중...</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
                    {plans.map(plan => {
                        const isCompany = plan.plan_key === 'company';
                        return (
                            <div key={plan.plan_key} style={{
                                border: '1px solid var(--border)', borderRadius: 12, padding: 18,
                                display: 'flex', flexDirection: 'column', gap: 10,
                                background: 'var(--bg-secondary)',
                            }}>
                                <div style={{ fontSize: 16, fontWeight: 800 }}>{PLAN_LABELS[plan.plan_key] || plan.plan_key}</div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>
                                    {isCompany ? '별도 협의' : (
                                        <>
                                            {(plan.price || 0).toLocaleString()}원
                                            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}> /월</span>
                                        </>
                                    )}
                                </div>
                                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.8, flex: 1 }}>
                                    <li>네이버 계정 최대 {plan.max_naver_accounts}개{isCompany ? '~ (협의 가능)' : ''}</li>
                                    <li>{plan.max_prompts != null ? `개인 프롬프트 최대 ${plan.max_prompts}개` : '개인 프롬프트 (준비 중)'}</li>
                                    <li>원고 생성 및 자동 발행 무제한</li>
                                    <li>황금키워드 검색 무제한</li>
                                </ul>

                                {isCompany ? (
                                    <a
                                        href={contactEmail ? `mailto:${contactEmail}?subject=${encodeURIComponent('컴퍼니 요금제 문의')}` : undefined}
                                        className="btn-secondary"
                                        style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}
                                    >
                                        문의하기
                                    </a>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        disabled={!!subscribingKey}
                                        onClick={() => handleSubscribe(plan.plan_key)}
                                        style={{ opacity: subscribingKey && subscribingKey !== plan.plan_key ? 0.5 : 1 }}
                                    >
                                        {subscribingKey === plan.plan_key ? '처리 중...' : '구독하기'}
                                    </button>
                                )}

                                {isCompany && contactEmail && (
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>{contactEmail}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '12px 14px', borderRadius: 10,
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            }}>
                <span
                    onClick={() => setAgreed(v => !v)}
                    style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                        border: agreed ? 'none' : '1.5px solid var(--border)',
                        background: agreed ? 'var(--accent)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all 0.15s',
                    }}
                >
                    {agreed && (
                        <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                            <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </span>
                <label onClick={() => setAgreed(v => !v)} style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.7, cursor: 'pointer' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>[필수] 정기결제 및 자동갱신 안내에 동의합니다.</strong>
                    <br />
                    · 본 구독은 매월 자동으로 갱신되며, 결제일에 등록된 카드로 요금이 자동 청구됩니다.
                    <br />
                    · 구독 해지는 설정 페이지의 &apos;구독 취소&apos; 버튼으로 언제든 가능하며, 이미 결제한 기간까지는 계속 이용하실 수 있습니다.
                </label>
            </div>
        </Modal>
    );
}
