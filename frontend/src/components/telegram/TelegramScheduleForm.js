"use client";

import { displayNaverId } from "@/lib/naver";

export const TELEGRAM_TONE_OPTIONS = ['친근한 존댓말', '여성적인 말투', '남성적인 말투', '일상체', '건강·의학'];
export const TELEGRAM_CATEGORY_OPTIONS = ['여행', '일상', '맛집', '리뷰', '건강', '재테크', 'IT', '육아', '반려동물'];
export const TELEGRAM_IMAGE_SOURCE_OPTIONS = [
    { value: 'gemini', label: 'AI 이미지 생성' },
    { value: 'stock', label: '무료 이미지' },
];

export const TELEGRAM_SLOT_MODES = [
    { value: 'suggest', label: '제안형', desc: '키워드만 제안, 승인 시 그때 생성' },
    { value: 'draft_approval', label: '완성형', desc: '원고를 미리 완성해두고 제목으로 승인' },
];

const SLOT_TEMPLATE_DEFAULTS = {
    suggest: "오늘은 '{keyword}' 주제로 발행해보는건 어떨까요?",
    draft_approval: "'{title}'라는 제목으로 원고를 작성해봤는데 발행할까요?",
};

export const TELEGRAM_SCHEDULE_FORM_DEFAULTS = {
    naver_account_id: '',
    slots: [],
    default_tone: TELEGRAM_TONE_OPTIONS[0],
    default_category: TELEGRAM_CATEGORY_OPTIONS[1],
    default_custom_instructions: '',
    default_image_source: TELEGRAM_IMAGE_SOURCE_OPTIONS[0].value,
};

function makeNewSlot() {
    return {
        _key: crypto.randomUUID(),
        mode: 'suggest',
        enabled: false,
        time: '10:00',
        message_template: SLOT_TEMPLATE_DEFAULTS.suggest,
    };
}

/**
 * 텔레그램 자동 발행 제안 설정 입력 필드 모음 (순수 표시용, 저장/메시지 표시는 부모가 담당).
 * showAccountSelector=false로 두면 "전체 공통 설정" 모드처럼 계정 선택 없이
 * 슬롯/기본값만 편집할 수 있다 (네이버 계정은 회원마다 달라서 전체 공통으로 못 미침).
 * value.slots의 각 항목은 { _key(React용 임시 id), mode, enabled, time, message_template }.
 */
export default function TelegramScheduleForm({ value, onChange, accounts = [], showAccountSelector = true, disabled = false }) {
    const patch = (fields) => onChange({ ...value, ...fields });

    const slots = value.slots || [];

    const patchSlot = (key, fields) => {
        patch({ slots: slots.map(s => (s._key === key ? { ...s, ...fields } : s)) });
    };

    const removeSlot = (key) => {
        patch({ slots: slots.filter(s => s._key !== key) });
    };

    const addSlot = () => {
        patch({ slots: [...slots, makeNewSlot()] });
    };

    return (
        <div>
            {showAccountSelector && (
                <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                        기준 네이버 계정
                    </label>
                    <select
                        className="select-field"
                        value={value.naver_account_id || ''}
                        disabled={disabled || accounts.length === 0}
                        onChange={e => patch({ naver_account_id: e.target.value })}
                    >
                        {accounts.length === 0 && <option value="">네이버 계정 없음</option>}
                        {accounts.map(a => (
                            <option key={a.id} value={a.id}>{displayNaverId(a.naver_id)} ({a.concept})</option>
                        ))}
                    </select>
                </div>
            )}

            <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                    발송 슬롯 ({slots.length}개)
                </label>

                {slots.length === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                        아직 슬롯이 없습니다. &quot;슬롯 추가&quot;로 발송 시각을 만들어주세요.
                    </p>
                )}

                {slots.map((slot) => {
                    const fieldsDisabled = disabled || !slot.enabled; // 켜기 체크박스가 off면 나머지 입력칸은 편집 불가
                    return (
                    <div key={slot._key} style={{ padding: 16, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                            <input
                                type="checkbox"
                                checked={!!slot.enabled}
                                disabled={disabled}
                                onChange={e => patchSlot(slot._key, { enabled: e.target.checked })}
                                style={{ width: 22, height: 22, cursor: disabled ? 'default' : 'pointer', flexShrink: 0 }}
                            />
                            <select
                                className="select-field"
                                style={{ width: 110 }}
                                value={slot.mode}
                                disabled={fieldsDisabled}
                                onChange={e => {
                                    const mode = e.target.value;
                                    // 문구가 직전까지 자동 기본값이었다면 모드 전환 시 새 모드의 기본 문구로 갈아끼움
                                    const wasDefault = slot.message_template === SLOT_TEMPLATE_DEFAULTS[slot.mode];
                                    patchSlot(slot._key, {
                                        mode,
                                        ...(wasDefault ? { message_template: SLOT_TEMPLATE_DEFAULTS[mode] } : {}),
                                    });
                                }}
                            >
                                {TELEGRAM_SLOT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                            <input
                                type="time"
                                className="input-field"
                                style={{ width: 120, marginLeft: 'auto' }}
                                value={slot.time}
                                disabled={fieldsDisabled}
                                onChange={e => patchSlot(slot._key, { time: e.target.value })}
                            />
                            <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '4px 10px', fontSize: 12 }}
                                disabled={disabled}
                                onClick={() => removeSlot(slot._key)}
                            >
                                삭제
                            </button>
                        </div>
                        <textarea
                            className="input-field"
                            rows={2}
                            disabled={fieldsDisabled}
                            value={slot.message_template}
                            onChange={e => patchSlot(slot._key, { message_template: e.target.value })}
                        />
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                            {slot.mode === 'suggest'
                                ? <>{'{keyword}'} 자리에 추천된 키워드가 들어갑니다. &quot;예&quot;를 누르면 그때부터 원고를 생성합니다.</>
                                : <>{'{title}'} 자리에 미리 생성된 원고 제목이 들어갑니다. 원고는 미리 다 써두고 승인만 받습니다.</>}
                        </p>
                    </div>
                    );
                })}

                <button type="button" className="btn-secondary" disabled={disabled} onClick={addSlot}>
                    + 슬롯 추가
                </button>
            </div>

            <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
                    텔레그램 자동생성 기본값
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <select
                        className="select-field"
                        value={value.default_tone}
                        disabled={disabled}
                        onChange={e => patch({ default_tone: e.target.value })}
                    >
                        {TELEGRAM_TONE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select
                        className="select-field"
                        value={value.default_category}
                        disabled={disabled}
                        onChange={e => patch({ default_category: e.target.value })}
                    >
                        {TELEGRAM_CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select
                        className="select-field"
                        value={value.default_image_source}
                        disabled={disabled}
                        onChange={e => patch({ default_image_source: e.target.value })}
                    >
                        {TELEGRAM_IMAGE_SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
                <textarea
                    className="input-field"
                    rows={2}
                    placeholder="예: 가족여행이니 접근성이 좋다는 내용을 꼭 넣어주세요."
                    disabled={disabled}
                    value={value.default_custom_instructions}
                    onChange={e => patch({ default_custom_instructions: e.target.value })}
                />
            </div>
        </div>
    );
}
