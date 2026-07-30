"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { SectionHeader, InlineAlert, Modal } from "@/components/ui";
import { toKoreanErrorMessage } from "@/lib/errorMessage";
import SubscribePlanModal from "@/components/SubscribePlanModal";

function daysInMonth(year, month) {
    if (!year || !month) return 31;
    return new Date(Number(year), Number(month), 0).getDate();
}

export default function SettingsPage() {
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [savedKey, setSavedKey] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [showKey, setShowKey] = useState(false);
    const { isSubscribed, planType, loading: subLoading } = useSubscription();

    const supabase = createClient();

    useEffect(() => { loadSettings(); }, []);

    const loadSettings = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
            .from('profiles')
            .select('gemini_api_key')
            .eq('id', user.id)
            .single();

        const key = data?.gemini_api_key || '';
        setSavedKey(key);
        setGeminiApiKey(key);
        setLoading(false);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage({ type: '', text: '' });

        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
            .from('profiles')
            .update({ gemini_api_key: geminiApiKey.trim() || null })
            .eq('id', user.id);

        if (error) {
            setMessage({ type: 'error', text: '저장 중 오류가 발생했습니다.' });
        } else {
            setSavedKey(geminiApiKey.trim());
            setMessage({ type: 'success', text: 'API 키가 저장되었습니다.' });
            setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        }
        setSaving(false);
    };

    const handleDelete = async () => {
        if (!confirm('등록된 Gemini API 키를 삭제하시겠습니까?\n삭제하면 서비스 기본 키로 동작합니다.')) return;
        setSaving(true);

        const { data: { user } } = await supabase.auth.getUser();
        await supabase
            .from('profiles')
            .update({ gemini_api_key: null })
            .eq('id', user.id);

        setGeminiApiKey('');
        setSavedKey('');
        setMessage({ type: 'success', text: 'API 키가 삭제되었습니다.' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        setSaving(false);
    };

    const maskKey = (key) => {
        if (!key) return '';
        if (key.length <= 8) return '••••••••';
        return key.slice(0, 8) + '••••••••••••••••' + key.slice(-4);
    };

    if (loading) return null;

    return (
        <div className="animate-in" style={{ maxWidth: 780, margin: '0 auto' }}>
            <div style={{ marginBottom: 32 }}>
                <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>설정 및 구독</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>서비스 계정 설정과 구독 플랜을 관리합니다.</p>
            </div>

            {/* Subscription Plan Section */}
            <SubscriptionSection isSubscribed={isSubscribed} planType={planType} loading={subLoading} />

            {/* Gemini API Key Section */}
            <div className="glass-card" style={{ marginBottom: 24 }}>
                <SectionHeader
                    icon={(
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                        </svg>
                    )}
                    gradient="linear-gradient(135deg, #4285f4, #34a853)"
                    title="Gemini API 키"
                    subtitle="내 API 키를 등록하면 원고/이미지 생성 시 해당 키로 동작합니다."
                />

                {/* 현재 등록 상태 */}
                <div style={{
                    padding: '12px 16px', borderRadius: 10, marginBottom: 20,
                    background: savedKey ? 'rgba(34, 197, 94, 0.08)' : 'var(--bg-secondary)',
                    border: `1px solid ${savedKey ? 'rgba(34, 197, 94, 0.2)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: savedKey ? 'var(--success)' : 'var(--text-muted)'
                        }} />
                        <span style={{ fontSize: 13, color: savedKey ? 'var(--success)' : 'var(--text-muted)' }}>
                            {savedKey ? '내 API 키 사용 중' : '서비스 기본 키 사용 중'}
                        </span>
                        {savedKey && (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                {showKey ? savedKey : maskKey(savedKey)}
                            </span>
                        )}
                    </div>
                    {savedKey && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                                onClick={() => setShowKey(!showKey)}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--text-muted)', fontSize: 12, padding: '4px 8px',
                                    borderRadius: 6
                                }}
                            >
                                {showKey ? '숨기기' : '보기'}
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={saving}
                                style={{
                                    background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                                    cursor: 'pointer', color: 'var(--error)', fontSize: 12,
                                    padding: '4px 10px', borderRadius: 6
                                }}
                            >
                                삭제
                            </button>
                        </div>
                    )}
                </div>

                {/* 입력 폼 */}
                <form onSubmit={handleSave}>
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                            API 키 입력
                        </label>
                        <input
                            type="password"
                            className="input-field"
                            placeholder="AIzaSy..."
                            value={geminiApiKey}
                            onChange={(e) => setGeminiApiKey(e.target.value)}
                            style={{ fontFamily: 'monospace', fontSize: 13 }}
                        />
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                            Google AI Studio (aistudio.google.com) 에서 발급받은 API 키를 입력하세요.
                        </p>
                    </div>

                    {message.text && (
                        <div style={{ marginBottom: 16 }}>
                            <InlineAlert type={message.type}>{message.text}</InlineAlert>
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={saving || geminiApiKey.trim() === savedKey}
                    >
                        {saving ? '저장 중...' : 'API 키 저장'}
                    </button>
                </form>
            </div>

            {/* Profile Edit Section */}
            <ProfileEditSection />

            {/* Chrome Extension Section */}
            <ExtensionTokenSection />

            {/* Telegram Link Section */}
            <TelegramLinkSection />
        </div>
    );
}

const PLAN_LABELS = { basic: '베이직', pro: '프로', company: '컴퍼니' };

function SubscriptionSection({ isSubscribed, planType, loading }) {
    const [canceling, setCanceling] = useState(false);
    const [billingMessage, setBillingMessage] = useState({ type: '', text: '' });
    const [subscription, setSubscription] = useState(null);
    const [showPlanModal, setShowPlanModal] = useState(false);
    const supabase = createClient();

    useEffect(() => {
        if (!isSubscribed) { setSubscription(null); return; }
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase
                .from('subscriptions')
                .select('status, current_period_end')
                .eq('user_id', user.id)
                .single();
            setSubscription(data || null);
        })();
    }, [isSubscribed]);

    const handleCancelClick = async () => {
        if (!confirm('구독을 취소하시겠습니까?\n이미 결제한 기간이 끝날 때까지는 계속 PRO 기능을 이용하실 수 있습니다.')) return;
        setCanceling(true);
        setBillingMessage({ type: '', text: '' });
        try {
            const res = await fetch('/api/billing/cancel', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '구독 취소에 실패했습니다.');
            setSubscription(prev => prev ? { ...prev, status: 'canceled' } : prev);
            setBillingMessage({ type: 'success', text: '구독이 취소되었습니다. 남은 기간까지는 계속 이용 가능합니다.' });
        } catch (err) {
            setBillingMessage({ type: 'error', text: toKoreanErrorMessage(err, '구독 취소에 실패했습니다. 잠시 후 다시 시도해주세요.') });
        } finally {
            setCanceling(false);
        }
    };

    const formatDate = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    };

    return (
        <div className="glass-card" style={{ marginBottom: 24 }}>
            <SectionHeader
                icon="⭐"
                gradient="var(--gradient-1)"
                title="구독 플랜"
                subtitle="구독하면 모든 기능을 제한 없이 이용할 수 있습니다."
            />

            {!loading && (
                <div style={{
                    padding: '12px 16px', borderRadius: 10, marginBottom: 20,
                    background: isSubscribed ? 'rgba(34, 197, 94, 0.08)' : 'var(--bg-secondary)',
                    border: `1px solid ${isSubscribed ? 'rgba(34, 197, 94, 0.2)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: isSubscribed ? 'var(--success)' : 'var(--text-muted)'
                    }} />
                    <span style={{ fontSize: 13, color: isSubscribed ? 'var(--success)' : 'var(--text-muted)' }}>
                        {isSubscribed
                            ? (subscription?.status === 'canceled'
                                ? `구독 취소됨 — ${formatDate(subscription.current_period_end)}까지 ${PLAN_LABELS[planType] || ''} 이용 가능`
                                : `${PLAN_LABELS[planType] || ''} 플랜 이용 중${subscription?.current_period_end ? ` — 다음 결제일 ${formatDate(subscription.current_period_end)}` : ''}`)
                            : '무료 체험 중 — 일부 기능이 제한됩니다'}
                    </span>
                </div>
            )}

            {billingMessage.text && (
                <div style={{ marginBottom: 16 }}>
                    <InlineAlert type={billingMessage.type}>{billingMessage.text}</InlineAlert>
                </div>
            )}

            <div className="bm-grid bm-grid-plan" style={{
                alignItems: 'center',
                padding: '18px 20px', borderRadius: 12,
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            }}>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
                        {isSubscribed ? `${PLAN_LABELS[planType] || ''} 플랜` : '요금제 안내'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                        {isSubscribed
                            ? '이용 중인 요금제 한도 내에서 모든 기능을 이용하실 수 있습니다.'
                            : '베이직 · 프로 · 컴퍼니 중 이용 규모에 맞는 요금제를 선택할 수 있습니다.'}
                    </div>
                </div>
                <div className="plan-card-actions" style={{ textAlign: 'right' }}>
                    {isSubscribed && subscription?.status === 'active' ? (
                        <button
                            type="button"
                            className="btn-secondary"
                            disabled={canceling}
                            onClick={handleCancelClick}
                            style={{ whiteSpace: 'nowrap', color: 'var(--error)', borderColor: 'rgba(239,68,68,0.3)' }}
                        >
                            {canceling ? '처리 중...' : '구독 취소'}
                        </button>
                    ) : !isSubscribed && !loading ? (
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setShowPlanModal(true)}
                            style={{ whiteSpace: 'nowrap' }}
                        >
                            구독하기
                        </button>
                    ) : null}
                </div>
            </div>

            <SubscribePlanModal
                open={showPlanModal}
                onClose={() => setShowPlanModal(false)}
                onSubscribed={() => {
                    setShowPlanModal(false);
                    setBillingMessage({ type: 'success', text: '구독이 시작되었습니다! 잠시 후 화면이 갱신됩니다.' });
                    setTimeout(() => window.location.reload(), 1200);
                }}
            />
        </div>
    );
}

function ProfileEditSection() {
    const [locked, setLocked] = useState(true);
    const [password, setPassword] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [verifyError, setVerifyError] = useState('');

    const [profileLoading, setProfileLoading] = useState(false);
    const [profile, setProfile] = useState({
        name: '', phone1: '', phone2: '', phone3: '',
        birthYear: '', birthMonth: '', birthDay: '',
    });
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState({ type: '', text: '' });

    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [withdrawing, setWithdrawing] = useState(false);
    const [withdrawError, setWithdrawError] = useState('');

    const supabase = createClient();

    const loadProfile = async () => {
        setProfileLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase
                .from('profiles')
                .select('name, phone, birth_date')
                .eq('id', user.id)
                .single();
            if (data) {
                const [p1, p2, p3] = (data.phone || '').split('-');
                const [y, m, d] = (data.birth_date || '').split('-');
                setProfile({
                    name: data.name || '',
                    phone1: p1 || '', phone2: p2 || '', phone3: p3 || '',
                    birthYear: y || '', birthMonth: m ? String(Number(m)) : '', birthDay: d ? String(Number(d)) : '',
                });
            }
        } finally {
            setProfileLoading(false);
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        setVerifying(true);
        setVerifyError('');
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.email) throw new Error('로그인 정보를 확인할 수 없습니다.');
            const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
            if (error) throw new Error('비밀번호가 일치하지 않습니다.');
            setPassword('');
            setLocked(false);
            loadProfile();
        } catch (err) {
            setVerifyError(toKoreanErrorMessage(err));
        } finally {
            setVerifying(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setSaveMessage({ type: '', text: '' });
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');
            const phone = (profile.phone1 || profile.phone2 || profile.phone3)
                ? `${profile.phone1}-${profile.phone2}-${profile.phone3}` : null;
            const birth_date = profile.birthYear && profile.birthMonth && profile.birthDay
                ? `${profile.birthYear}-${String(profile.birthMonth).padStart(2, '0')}-${String(profile.birthDay).padStart(2, '0')}`
                : null;
            const { error } = await supabase
                .from('profiles')
                .update({ name: profile.name.trim() || null, phone, birth_date })
                .eq('id', user.id);
            if (error) throw new Error(toKoreanErrorMessage(error));
            setSaveMessage({ type: 'success', text: '회원정보가 저장되었습니다.' });
        } catch (err) {
            setSaveMessage({ type: 'error', text: toKoreanErrorMessage(err) });
        } finally {
            setSaving(false);
        }
    };

    const handleWithdraw = async () => {
        setWithdrawing(true);
        setWithdrawError('');
        try {
            const res = await fetch('/api/auth/delete-account', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '탈퇴 처리에 실패했습니다.');
            await supabase.auth.signOut();
            window.location.href = '/login?withdrawn=1';
        } catch (err) {
            setWithdrawError(toKoreanErrorMessage(err, '탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요.'));
            setWithdrawing(false);
        }
    };

    return (
        <div className="glass-card" style={{ marginBottom: 24 }}>
            <SectionHeader
                icon="👤"
                gradient="linear-gradient(135deg, #6366f1, #8b5cf6)"
                title="회원정보 수정"
                subtitle="본인 확인 후 가입 정보를 수정할 수 있습니다."
            />

            {locked ? (
                <>
                    <div style={{ marginBottom: 16 }}>
                        <InlineAlert type="info">비밀번호를 입력해 본인 확인 후 이용 가능합니다.</InlineAlert>
                    </div>
                    <form onSubmit={handleVerify} style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="password"
                            className="input-field"
                            placeholder="비밀번호"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={verifying || !password}
                            style={{ whiteSpace: 'nowrap' }}
                        >
                            {verifying ? '확인 중...' : '확인'}
                        </button>
                    </form>
                    {verifyError && (
                        <div style={{ marginTop: 12 }}>
                            <InlineAlert type="error">{verifyError}</InlineAlert>
                        </div>
                    )}
                </>
            ) : profileLoading ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>불러오는 중...</p>
            ) : (
                <form onSubmit={handleSave}>
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                            이름
                        </label>
                        <input
                            className="input-field"
                            value={profile.name}
                            onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))}
                        />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                            휴대폰번호
                        </label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input className="input-field" maxLength={3} value={profile.phone1}
                                onChange={(e) => setProfile(p => ({ ...p, phone1: e.target.value.replace(/\D/g, '') }))} />
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                            <input className="input-field" maxLength={4} value={profile.phone2}
                                onChange={(e) => setProfile(p => ({ ...p, phone2: e.target.value.replace(/\D/g, '') }))} />
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                            <input className="input-field" maxLength={4} value={profile.phone3}
                                onChange={(e) => setProfile(p => ({ ...p, phone3: e.target.value.replace(/\D/g, '') }))} />
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                            생년월일
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <select className="input-field" value={profile.birthYear}
                                onChange={(e) => setProfile(p => ({ ...p, birthYear: e.target.value }))} style={{ flex: 5 }}>
                                <option value="">년도</option>
                                {Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                                    <option key={y} value={y}>{y}년</option>
                                ))}
                            </select>
                            <select className="input-field" value={profile.birthMonth}
                                onChange={(e) => setProfile(p => ({ ...p, birthMonth: e.target.value }))} style={{ flex: 3 }}>
                                <option value="">월</option>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                    <option key={m} value={m}>{m}월</option>
                                ))}
                            </select>
                            <select className="input-field" value={profile.birthDay}
                                onChange={(e) => setProfile(p => ({ ...p, birthDay: e.target.value }))} style={{ flex: 3 }}>
                                <option value="">일</option>
                                {Array.from({ length: daysInMonth(profile.birthYear, profile.birthMonth) }, (_, i) => i + 1).map((d) => (
                                    <option key={d} value={d}>{d}일</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {saveMessage.text && (
                        <div style={{ marginBottom: 16 }}>
                            <InlineAlert type={saveMessage.type}>{saveMessage.text}</InlineAlert>
                        </div>
                    )}

                    <button type="submit" className="btn-primary" disabled={saving}>
                        {saving ? '저장 중...' : '저장'}
                    </button>
                </form>
            )}

            <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                <button
                    type="button"
                    onClick={() => setShowWithdrawModal(true)}
                    disabled={locked}
                    style={{
                        background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
                        padding: '8px 14px', fontSize: 13,
                        color: locked ? 'var(--text-muted)' : 'var(--error)',
                        cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.6 : 1,
                    }}
                >
                    회원 탈퇴
                </button>
                {locked && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                        본인 확인 후 이용 가능합니다.
                    </p>
                )}
            </div>

            <Modal open={showWithdrawModal} onClose={() => !withdrawing && setShowWithdrawModal(false)} width={420}>
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>정말 탈퇴하시겠습니까?</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 8 }}>
                    탈퇴 시 아래 데이터가 모두 삭제되며 복구할 수 없습니다:
                </p>
                <ul style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.9, paddingLeft: 18, marginBottom: 12 }}>
                    <li>연결된 네이버 계정 정보 및 로그인 세션</li>
                    <li>작성/발행한 모든 포스팅 기록 및 원고</li>
                    <li>순위 추적 기록</li>
                    <li>구독 및 결제 이력</li>
                    <li>등록하신 Gemini API 키</li>
                </ul>
                <p style={{ fontSize: 13, color: 'var(--error)', fontWeight: 600, marginBottom: 20 }}>
                    이 작업은 되돌릴 수 없습니다.
                </p>
                {withdrawError && (
                    <div style={{ marginBottom: 16 }}>
                        <InlineAlert type="error">{withdrawError}</InlineAlert>
                    </div>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" onClick={() => setShowWithdrawModal(false)} disabled={withdrawing}>
                        취소
                    </button>
                    <button
                        type="button"
                        onClick={handleWithdraw}
                        disabled={withdrawing}
                        style={{
                            background: 'var(--error)', color: '#fff', border: 'none', borderRadius: 12,
                            padding: '12px 24px', fontSize: 15, fontWeight: 600,
                            cursor: withdrawing ? 'not-allowed' : 'pointer',
                            opacity: withdrawing ? 0.7 : 1,
                        }}
                    >
                        {withdrawing ? '처리 중...' : '탈퇴하기'}
                    </button>
                </div>
            </Modal>
        </div>
    );
}

function ExtensionTokenSection() {
    const [hasToken, setHasToken] = useState(false); // 발급된 적 있는지 (extension_tokens에 행이 있는지)
    const [newToken, setNewToken] = useState(''); // 방금 발급한 원본 토큰 — 딱 한 번만 표시됨
    const [copied, setCopied] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    const checkExisting = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        const { data } = await supabase.from('extension_tokens').select('user_id').eq('user_id', user.id).maybeSingle();
        setHasToken(!!data);
        setLoading(false);
    };

    useEffect(() => { checkExisting(); }, []);

    const generateToken = async () => {
        setGenerating(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setGenerating(false); return; }

        // 웹 로그인 세션과 완전히 무관한, 확장프로그램 전용 토큰을 브라우저에서 직접 생성 —
        // 원본은 저장하지 않고 해시만 서버(테이블)에 남긴다.
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        const rawToken = 'bmext_' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
        const tokenHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        const { error } = await supabase
            .from('extension_tokens')
            .upsert({ user_id: user.id, token_hash: tokenHash }, { onConflict: 'user_id' });

        setGenerating(false);
        if (error) { alert('토큰 발급에 실패했습니다: ' + toKoreanErrorMessage(error)); return; }
        setNewToken(rawToken);
        setHasToken(true);
    };

    const handleCopy = () => {
        if (!newToken) return;
        navigator.clipboard.writeText(newToken).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    if (loading) return null;

    return (
        <div className="glass-card">
            <SectionHeader
                icon="🧩"
                gradient="linear-gradient(135deg, #78716c, #a8a29e)"
                title="크롬 확장 프로그램 연결"
                subtitle="확장 프로그램 전용 토큰을 발급해서 인증합니다. 한 번 설정하면 다시 만료되지 않습니다."
            />

            {newToken ? (
                <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                        새로 발급된 토큰 (확장 프로그램에 붙여넣기)
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="text"
                            readOnly
                            value={newToken}
                            className="input-field"
                            style={{ fontFamily: 'monospace', fontSize: 11 }}
                        />
                        <button
                            type="button"
                            className="btn-secondary"
                            style={{ whiteSpace: 'nowrap', padding: '0 16px' }}
                            onClick={handleCopy}
                        >
                            {copied ? '복사됨!' : '복사'}
                        </button>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--error)', marginTop: 8 }}>
                        이 화면을 벗어나면 이 토큰은 다시 볼 수 없습니다. 지금 복사해서 확장 프로그램에 붙여넣어주세요.
                    </p>
                </div>
            ) : (
                <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                        {hasToken
                            ? '이미 토큰이 발급되어 있습니다. 재발급하면 기존 토큰은 즉시 무효화됩니다.'
                            : '아직 발급된 토큰이 없습니다.'}
                    </p>
                    <button
                        type="button"
                        className="btn-primary"
                        disabled={generating}
                        onClick={generateToken}
                    >
                        {generating ? '발급 중...' : hasToken ? '토큰 재발급' : '토큰 발급하기'}
                    </button>
                </div>
            )}
        </div>
    );
}

const TELEGRAM_LINK_POLL_INTERVAL_MS = 3000;
const TELEGRAM_LINK_POLL_MAX_ATTEMPTS = 40; // 3초 * 40 = 최대 2분간 폴링 후 자동 중단

function TelegramLinkSection() {
    const [chatId, setChatId] = useState(null); // null=미확인, 0/false 대신 명시적 null 사용
    const [linking, setLinking] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const supabase = createClient();

    const loadStatus = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
            .from('profiles')
            .select('telegram_chat_id')
            .eq('id', user.id)
            .single();
        setChatId(data?.telegram_chat_id || null);
    };

    useEffect(() => { loadStatus(); }, []);

    const handleLinkClick = async () => {
        const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
        if (!botUsername) {
            setMessage({ type: 'error', text: '텔레그램 봇 설정이 완료되지 않았습니다. 관리자에게 문의해주세요.' });
            return;
        }

        setLinking(true);
        setMessage({ type: '', text: '' });

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLinking(false); return; }

        const code = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        const { error } = await supabase
            .from('telegram_link_codes')
            .insert({ user_id: user.id, code, expires_at: expiresAt });

        if (error) {
            setMessage({ type: 'error', text: '연동 코드 생성에 실패했습니다. 다시 시도해주세요.' });
            setLinking(false);
            return;
        }

        window.open(`https://t.me/${botUsername}?start=${code}`, '_blank');

        // 텔레그램에서 /start를 보내면 웹훅이 profiles.telegram_chat_id를 채워준다 —
        // 그때까지 짧은 간격으로 폴링하다가 연동이 확인되거나 최대 시도 횟수를 넘기면 멈춘다.
        let attempts = 0;
        let stopped = false;

        const poll = async () => {
            attempts += 1;
            const { data } = await supabase
                .from('profiles')
                .select('telegram_chat_id')
                .eq('id', user.id)
                .single();

            if (data?.telegram_chat_id) {
                stopped = true;
                setChatId(data.telegram_chat_id);
                setLinking(false);
                setMessage({ type: 'success', text: '텔레그램 연동이 완료되었습니다!' });
                return;
            }

            if (attempts >= TELEGRAM_LINK_POLL_MAX_ATTEMPTS) {
                stopped = true;
                setLinking(false);
                setMessage({ type: 'error', text: '연동 확인 시간이 초과되었습니다. 텔레그램에서 /start를 보냈는지 확인 후 다시 시도해주세요.' });
                return;
            }

            if (!stopped) setTimeout(poll, TELEGRAM_LINK_POLL_INTERVAL_MS);
        };

        poll();
    };

    return (
        <div className="glass-card" style={{ marginBottom: 24 }}>
            <SectionHeader
                icon="✈️"
                gradient="linear-gradient(135deg, #29b6f6, #0288d1)"
                title="텔레그램 연동"
                subtitle="텔레그램으로 알림을 받고 응답할 수 있습니다."
            />

            <div style={{
                padding: '12px 16px', borderRadius: 10, marginBottom: 16,
                background: chatId ? 'rgba(34, 197, 94, 0.08)' : 'var(--bg-secondary)',
                border: `1px solid ${chatId ? 'rgba(34, 197, 94, 0.2)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', gap: 10
            }}>
                <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: chatId ? 'var(--success)' : 'var(--text-muted)'
                }} />
                <span style={{ fontSize: 13, color: chatId ? 'var(--success)' : 'var(--text-muted)' }}>
                    {chatId ? '연동됨' : '연동되지 않음'}
                </span>
            </div>

            {message.text && (
                <div style={{ marginBottom: 16 }}>
                    <InlineAlert type={message.type}>{message.text}</InlineAlert>
                </div>
            )}

            <button
                type="button"
                className="btn-primary"
                disabled={linking}
                onClick={handleLinkClick}
            >
                {linking ? '연동 확인 중...' : chatId ? '다시 연동하기' : '텔레그램 연동하기'}
            </button>
        </div>
    );
}
