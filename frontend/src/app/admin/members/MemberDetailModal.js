'use client';

import { useState, useEffect } from 'react';
import { Modal, InlineAlert } from '@/components/ui';
import { getMemberDetail, setCompanyPlan } from '@/lib/admin-member-actions';

const PLAN_LABELS = { free: '무료', basic: '베이직', pro: '프로', company: '컴퍼니' };

function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function MemberDetailModal({ open, onClose, memberId, onChanged }) {
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState('');
    const [form, setForm] = useState({ price: '', max_naver_accounts: '', max_prompts: '' });
    const [showCompanyForm, setShowCompanyForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    useEffect(() => {
        if (!open || !memberId) return;
        setDetail(null);
        setError('');
        setShowCompanyForm(false);
        setSaveError('');
        getMemberDetail(memberId)
            .then(d => {
                setDetail(d);
                setForm({
                    price: d.override_price ?? '',
                    max_naver_accounts: d.override_max_naver_accounts ?? '',
                    max_prompts: d.override_max_prompts ?? '',
                });
            })
            .catch(err => setError(err.message));
    }, [open, memberId]);

    const handleSaveCompany = async () => {
        setSaving(true);
        setSaveError('');
        try {
            await setCompanyPlan(memberId, form);
            const refreshed = await getMemberDetail(memberId);
            setDetail(refreshed);
            setShowCompanyForm(false);
            onChanged?.();
        } catch (err) {
            setSaveError(err.message);
        }
        setSaving(false);
    };

    return (
        <Modal open={open} onClose={onClose} width={480}>
            <button
                onClick={onClose}
                style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}
            >
                ✕
            </button>

            {error && <InlineAlert type="error">{error}</InlineAlert>}

            {!error && !detail && (
                <div style={{ fontSize: 14, color: 'var(--text-muted)', padding: '20px 0' }}>불러오는 중...</div>
            )}

            {detail && (
                <>
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{detail.email}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            가입일 {formatDateTime(detail.created_at)} · <span className="badge">{PLAN_LABELS[detail.plan_type] || detail.plan_type}</span>
                        </div>
                    </div>

                    {/* 컴퍼니 개별 설정 */}
                    {detail.plan_type === 'company' && !showCompanyForm && (
                        <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>컴퍼니 개별 설정</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.9 }}>
                                결제 금액: <strong>{(detail.override_price || 0).toLocaleString()}원/월</strong><br />
                                등록 가능 계정: <strong>{detail.override_max_naver_accounts}개</strong><br />
                                등록 가능 프롬프트: <strong>{detail.override_max_prompts}개</strong>
                            </div>
                            <button className="btn-secondary" style={{ marginTop: 10, fontSize: 12, padding: '6px 12px' }} onClick={() => setShowCompanyForm(true)}>
                                수정
                            </button>
                        </div>
                    )}

                    {(detail.plan_type === 'free' || showCompanyForm) && (
                        <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                                {detail.plan_type === 'free' ? '컴퍼니로 전환' : '컴퍼니 설정 수정'}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    결제 금액 (원/월) *
                                    <input
                                        type="number" min="1" className="input-field" style={{ width: '100%', marginTop: 4 }}
                                        value={form.price}
                                        onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                                    />
                                </label>
                                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    등록 가능 계정 수 *
                                    <input
                                        type="number" min="1" className="input-field" style={{ width: '100%', marginTop: 4 }}
                                        value={form.max_naver_accounts}
                                        onChange={e => setForm(f => ({ ...f, max_naver_accounts: e.target.value }))}
                                    />
                                </label>
                                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    등록 가능 프롬프트 수 *
                                    <input
                                        type="number" min="0" className="input-field" style={{ width: '100%', marginTop: 4 }}
                                        value={form.max_prompts}
                                        onChange={e => setForm(f => ({ ...f, max_prompts: e.target.value }))}
                                    />
                                </label>
                            </div>
                            {saveError && <div style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>{saveError}</div>}
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                <button
                                    className="btn-primary"
                                    style={{ fontSize: 12, padding: '6px 14px' }}
                                    disabled={saving || !form.price || !form.max_naver_accounts || form.max_prompts === ''}
                                    onClick={handleSaveCompany}
                                >
                                    {saving ? '저장 중...' : (detail.plan_type === 'free' ? '컴퍼니로 전환' : '저장')}
                                </button>
                                {showCompanyForm && (
                                    <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setShowCompanyForm(false)}>
                                        취소
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 결제 내역 */}
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>최근 결제 내역</div>
                        {detail.payments.length === 0 ? (
                            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>결제 이력이 없습니다.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                                {detail.payments.map(p => (
                                    <div key={p.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 12px', borderRadius: 8, background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border)', fontSize: 12.5,
                                    }}>
                                        <span style={{ color: 'var(--text-muted)' }}>{formatDateTime(p.created_at)}</span>
                                        <span style={{ fontWeight: 600 }}>{(p.amount || 0).toLocaleString()}원</span>
                                        {p.status === 'paid' ? (
                                            <span className="badge" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)' }}>결제완료</span>
                                        ) : (
                                            <span className="badge" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--error)' }} title={p.failure_reason || ''}>실패</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </Modal>
    );
}
