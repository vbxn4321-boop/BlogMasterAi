'use client';

import { useState, useEffect } from 'react';
import * as PortOne from '@portone/browser-sdk/v2';
import { createClient } from '@/lib/supabase/client';
import { toKoreanErrorMessage } from '@/lib/errorMessage';

// 컴퍼니로 전환됐지만 아직 카드(빌링키) 등록을 안 한 회원을 위한 강제 결제 모달.
// dashboard/layout.js가 로그인 직후 이 조건을 감지하면 대시보드 화면 대신 이 컴포넌트 하나만
// 렌더링한다 — 닫기 버튼이나 오버레이 클릭으로 빠져나갈 방법이 없고, 결제를 완료하지 않고
// 이탈을 시도하면(카드 등록 팝업 취소, 로그아웃 버튼) 그대로 로그아웃 처리된다.
export default function CompanyBillingGateModal({ onCompleted }) {
    const [price, setPrice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const supabase = createClient();
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }
            const { data: profile } = await supabase
                .from('profiles').select('override_price').eq('id', user.id).single();
            setPrice(profile?.override_price ?? null);
            setLoading(false);
        })();
    }, []);

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    const handlePay = async () => {
        setError('');
        setProcessing(true);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            const issueResponse = await PortOne.requestIssueBillingKey({
                storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID,
                channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY,
                billingKeyMethod: 'CARD',
                issueId: `issue_${user.id}_${Date.now()}`,
                issueName: '컴퍼니 플랜 정기결제 카드 등록',
                customer: { customerId: user.id, email: user.email || undefined },
            });

            if (!issueResponse || issueResponse.code) {
                // 카드 등록을 취소했거나 실패 — 결제 없이 이용하는 것을 막기 위해 로그아웃 처리
                await handleLogout();
                return;
            }

            const res = await fetch('/api/billing/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ billing_key_id: issueResponse.billingKey, plan_key: 'company' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '결제 처리에 실패했습니다.');

            onCompleted?.();
        } catch (err) {
            setError(toKoreanErrorMessage(err, '결제에 실패했습니다. 카드 정보를 확인하고 다시 시도해주세요.'));
            setProcessing(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(10, 15, 30, 0.85)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
            <div className="glass-card" style={{ width: 420, maxWidth: '90vw', padding: 32, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
                <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>컴퍼니 플랜 결제가 필요합니다</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20 }}>
                    관리자가 설정한 컴퍼니 요금제 결제를 완료해야 서비스를 이용하실 수 있습니다.
                </p>

                {loading ? (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>불러오는 중...</div>
                ) : price ? (
                    <div style={{
                        fontSize: 26, fontWeight: 800, color: 'var(--accent)', marginBottom: 20,
                    }}>
                        {price.toLocaleString()}원<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}> /월</span>
                    </div>
                ) : (
                    <div style={{ fontSize: 13, color: 'var(--error)', marginBottom: 20 }}>
                        결제 금액이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.
                    </div>
                )}

                {error && (
                    <div style={{ fontSize: 12.5, color: 'var(--error)', marginBottom: 16 }}>{error}</div>
                )}

                <button
                    type="button"
                    className="btn-primary"
                    disabled={processing || loading || !price}
                    onClick={handlePay}
                    style={{ width: '100%', marginBottom: 10 }}
                >
                    {processing ? '처리 중...' : '카드 등록하고 결제하기'}
                </button>
                <button
                    type="button"
                    onClick={handleLogout}
                    style={{
                        width: '100%', background: 'none', border: 'none',
                        color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer', padding: 6,
                    }}
                >
                    로그아웃
                </button>
            </div>
        </div>
    );
}
