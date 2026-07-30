"use client";

import { useState, useEffect } from "react";
import { InlineAlert } from "@/components/ui";
import { listSubscriptionPlans, updateSubscriptionPlan } from "@/lib/admin-subscription-actions";

const PLAN_LABELS = { basic: '베이직', pro: '프로', company: '컴퍼니' };

function PlanRow({ plan, onSaved }) {
    const [form, setForm] = useState({
        price: plan.price ?? 0,
        max_naver_accounts: plan.max_naver_accounts ?? 1,
        max_prompts: plan.max_prompts ?? '',
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const dirty =
        Number(form.price) !== plan.price ||
        Number(form.max_naver_accounts) !== plan.max_naver_accounts ||
        (form.max_prompts === '' ? null : Number(form.max_prompts)) !== plan.max_prompts;

    const handleChange = (field) => (e) => {
        setForm(prev => ({ ...prev, [field]: e.target.value }));
        setMessage({ type: '', text: '' });
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage({ type: '', text: '' });
        try {
            await updateSubscriptionPlan(plan.plan_key, form);
            setMessage({ type: 'success', text: '저장되었습니다.' });
            onSaved();
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        }
        setSaving(false);
    };

    return (
        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <td style={{ padding: '16px 8px', fontSize: 14, fontWeight: 700 }}>
                {PLAN_LABELS[plan.plan_key] || plan.plan_key}
            </td>
            <td style={{ padding: '12px 8px' }}>
                <input
                    type="number" min="0" step="100"
                    value={form.price}
                    onChange={handleChange('price')}
                    style={{ width: 110 }}
                    className="input-field"
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>원/월</span>
            </td>
            <td style={{ padding: '12px 8px' }}>
                <input
                    type="number" min="1" step="1"
                    value={form.max_naver_accounts}
                    onChange={handleChange('max_naver_accounts')}
                    style={{ width: 80 }}
                    className="input-field"
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>개</span>
            </td>
            <td style={{ padding: '12px 8px' }}>
                <input
                    type="number" min="0" step="1"
                    value={form.max_prompts}
                    onChange={handleChange('max_prompts')}
                    placeholder="미설정"
                    style={{ width: 80 }}
                    className="input-field"
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>개</span>
            </td>
            <td style={{ padding: '12px 8px', minWidth: 160 }}>
                <button
                    className="btn-primary"
                    disabled={!dirty || saving}
                    onClick={handleSave}
                    style={{ fontSize: 13, padding: '7px 16px', opacity: (!dirty || saving) ? 0.5 : 1 }}
                >
                    {saving ? '저장 중...' : '저장'}
                </button>
                {message.text && (
                    <div style={{ marginTop: 6, fontSize: 12, color: message.type === 'error' ? 'var(--error)' : 'var(--success)' }}>
                        {message.text}
                    </div>
                )}
            </td>
        </tr>
    );
}

export default function AdminSubscriptionsPage() {
    const [plans, setPlans] = useState(null);
    const [error, setError] = useState('');

    const load = () => {
        listSubscriptionPlans()
            .then(setPlans)
            .catch(err => setError(err.message));
    };

    useEffect(() => { load(); }, []);

    return (
        <div className="animate-in">
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>구독 관리</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
                베이직 · 프로 · 컴퍼니 요금제의 가격과 등급별 한도를 설정합니다.
                가격을 바꾸면 이미 구독 중인 사용자는 <strong>다음 결제 회차부터</strong> 새 가격이 적용됩니다.
            </p>

            <div style={{ marginBottom: 20 }}>
                <InlineAlert type="warning">
                    등록 가능 프롬프트 수는 아직 실제로 개인 프롬프트를 등록하는 기능이 없어, 지금은 값만 저장해둘 뿐 어디에도 적용되지 않습니다.
                    해당 기능이 만들어지면 이 값과 연동할 예정입니다.
                </InlineAlert>
            </div>

            {error && <InlineAlert type="error">{error}</InlineAlert>}

            {!plans ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>불러오는 중...</div>
            ) : (
                <div className="glass-card">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>등급</th>
                                <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>가격</th>
                                <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>등록 가능 계정</th>
                                <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>등록 가능 프롬프트</th>
                                <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {plans.map(plan => (
                                <PlanRow key={plan.plan_key} plan={plan} onSaved={load} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
