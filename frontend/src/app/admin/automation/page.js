"use client";

import { useState, useEffect } from "react";
import { SectionHeader, InlineAlert } from "@/components/ui";
import TelegramScheduleForm, { TELEGRAM_SCHEDULE_FORM_DEFAULTS } from "@/components/telegram/TelegramScheduleForm";
import {
    listMembersForAutomation,
    getMemberAutomationData,
    saveMemberTelegramSettings,
    applyCommonTelegramSettingsToAll,
} from "@/lib/admin-telegram-actions";

export default function AdminAutomationPage() {
    return (
        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
                <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>자동화</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    텔레그램 자동 발행 제안을 회원별로 개별 설정하거나, 연동된 전체 회원에게 공통 설정을 한 번에 적용할 수 있습니다.
                </p>
            </div>

            <CommonScheduleSection />
            <MemberScheduleSection />
        </div>
    );
}

function MemberScheduleSection() {
    const [members, setMembers] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [accounts, setAccounts] = useState([]);
    const [value, setValue] = useState(TELEGRAM_SCHEDULE_FORM_DEFAULTS);
    const [loadingMember, setLoadingMember] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        listMembersForAutomation().then(setMembers).catch(() => {});
    }, []);

    useEffect(() => {
        if (!selectedId) {
            setAccounts([]);
            setValue(TELEGRAM_SCHEDULE_FORM_DEFAULTS);
            setMessage({ type: '', text: '' });
            return;
        }
        setLoadingMember(true);
        setMessage({ type: '', text: '' });
        getMemberAutomationData(selectedId)
            .then(({ accounts, settings, slots }) => {
                setAccounts(accounts);
                setValue({
                    ...TELEGRAM_SCHEDULE_FORM_DEFAULTS,
                    naver_account_id: accounts[0]?.id || '',
                    ...(settings || {}),
                    slots: (slots || []).map(s => ({ ...s, _key: s.id })),
                });
            })
            .catch(err => setMessage({ type: 'error', text: err.message }))
            .finally(() => setLoadingMember(false));
    }, [selectedId]);

    const handleSave = async () => {
        setSaving(true);
        setMessage({ type: '', text: '' });
        try {
            const { naver_account_id, default_tone, default_category, default_custom_instructions, default_image_source, slots } = value;
            await saveMemberTelegramSettings(selectedId, {
                naver_account_id, default_tone, default_category, default_custom_instructions, default_image_source,
                slots: slots.map(s => ({ mode: s.mode, enabled: s.enabled, time: s.time, message_template: s.message_template })),
            });
            setMessage({ type: 'success', text: '저장되었습니다.' });
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        }
        setSaving(false);
    };

    return (
        <div className="glass-card">
            <SectionHeader
                icon="👤"
                gradient="linear-gradient(135deg, #29b6f6, #0288d1)"
                title="회원별 설정"
                subtitle="특정 회원 한 명의 텔레그램 자동 발행 제안 설정을 편집합니다."
            />

            <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                    회원 선택
                </label>
                <select
                    className="select-field"
                    value={selectedId}
                    onChange={e => setSelectedId(e.target.value)}
                >
                    <option value="">회원을 선택하세요</option>
                    {members.map(m => (
                        <option key={m.id} value={m.id}>{m.email}</option>
                    ))}
                </select>
            </div>

            <TelegramScheduleForm
                value={value}
                onChange={setValue}
                accounts={accounts}
                showAccountSelector
                disabled={!selectedId || loadingMember}
            />

            {message.text && (
                <div style={{ marginBottom: 16 }}>
                    <InlineAlert type={message.type}>{message.text}</InlineAlert>
                </div>
            )}

            <button type="button" className="btn-primary" disabled={!selectedId || loadingMember || saving} onClick={handleSave}>
                {saving ? '저장 중...' : '저장'}
            </button>
        </div>
    );
}

function CommonScheduleSection() {
    const [value, setValue] = useState(TELEGRAM_SCHEDULE_FORM_DEFAULTS);
    const [applying, setApplying] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const handleApply = async () => {
        if (!window.confirm('텔레그램이 연동된 전체 회원에게 이 설정을 적용합니다. 각 회원이 개별적으로 설정해둔 시각/문구/기본값은 이 값으로 덮어써집니다. 계속할까요?')) return;

        setApplying(true);
        setMessage({ type: '', text: '' });
        try {
            // naver_account_id는 회원마다 다르므로 공통 적용 대상에서 제외 (각 회원 쪽에서 보존/자동 채움)
            const { naver_account_id, slots, ...commonFields } = value;
            const result = await applyCommonTelegramSettingsToAll({
                ...commonFields,
                slots: slots.map(s => ({ mode: s.mode, enabled: s.enabled, time: s.time, message_template: s.message_template })),
            });
            setMessage({
                type: 'success',
                text: `적용 완료: ${result.applied}명 적용됨${result.skipped ? `, ${result.skipped}명은 네이버 계정이 없어 건너뜀` : ''}.`,
            });
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        }
        setApplying(false);
    };

    return (
        <div className="glass-card">
            <SectionHeader
                icon="📢"
                gradient="linear-gradient(135deg, #10b981, #059669)"
                title="전체 공통 설정"
                subtitle="텔레그램이 연동된 전체 회원에게 동일한 시각/문구/기본값을 한 번에 적용합니다."
            />

            <TelegramScheduleForm value={value} onChange={setValue} showAccountSelector={false} />

            {message.text && (
                <div style={{ marginBottom: 16 }}>
                    <InlineAlert type={message.type}>{message.text}</InlineAlert>
                </div>
            )}

            <button type="button" className="btn-primary" disabled={applying} onClick={handleApply}>
                {applying ? '적용 중...' : '전체 적용'}
            </button>
        </div>
    );
}
