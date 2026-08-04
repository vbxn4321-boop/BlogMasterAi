"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useSubscription } from "@/hooks/useSubscription";
import { DEMO_ACCOUNT, DEMO_DRAFT } from "@/lib/trial";
import { displayNaverId } from "@/lib/naver";
import { toKoreanErrorMessage } from "@/lib/errorMessage";
import { fetchWithAuthRetry } from "@/lib/fetchWithAuthRetry";
import SubscriptionGateModal from "@/components/SubscriptionGateModal";
import OnboardingTour, { ONBOARDING_START_EVENT } from "@/components/onboarding/OnboardingTour";
import { postTourSteps } from "@/lib/onboardingSteps";

const Icons = {
    Sparkles: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" /></svg>
    ),
    PenTool: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19 7-7 3 3-7 7-3-3z" /><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18z" /><path d="m2 2 5 5" /><path d="m8.5 8.5 1.5 1.5" /></svg>
    ),
    Link: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
    ),
    Zap: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
    ),
    Clock: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
    ),
    Send: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
    ),
    ChevronRight: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
    ),
    Check: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
    ),
    Image: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
    ),
    Plus: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
    ),
    Trash2: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
    ),
    Search: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
    ),
    X: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
    ),
    Video: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
    ),
    Gif: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M9 12h2v2H9v-4h3"/><path d="M14 10v4"/><path d="M17 10h-1.5a1.5 1.5 0 0 0 0 3H17"/></svg>
    ),
    SwitchHorizontal: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 4l4 4-4 4"/><path d="M3 8h18"/><path d="M7 20l-4-4 4-4"/><path d="M21 16H3"/></svg>
    )
};

const QUOTE_STYLES = [
    { key: 'QUOTE_VERTICAL',       label: '버티컬',     icon: '▌', desc: '왼쪽 세로선 강조 스타일' },
    { key: 'QUOTE_DEFAULT',        label: '따옴표',     icon: '❝', desc: '큰따옴표 인용 스타일' },
    { key: 'QUOTE_POSTIT',         label: '포스트잇',   icon: '🟨', desc: '메모지 느낌의 스타일' },
    { key: 'QUOTE_BALLOON',        label: '말풍선',     icon: '💬', desc: '둥근 말풍선 스타일' },
    { key: 'QUOTE_LINE_QUOTATION', label: '라인&따옴표', icon: '—', desc: '밑줄과 따옴표 조합 스타일' },
    { key: 'QUOTE_FRAME',          label: '프레임',     icon: '▢', desc: '테두리 박스 스타일' },
];

const QUOTE_TAG_PATTERN = /\[(QUOTE_VERTICAL|QUOTE_DEFAULT|QUOTE_POSTIT|QUOTE_BALLOON|QUOTE_LINE_QUOTATION|QUOTE_FRAME)\]([\s\S]*?)\[\/\1\]/gi;

// 미리보기 화면에서만 쓰는 태그 렌더러 — previewData.body 원본(raw 태그 문자열)은 건드리지 않고
// 읽기 전용 표시 시점에만 [B]/[QUOTE_*]/[IMAGE_ANCHOR_N]/[BUSINESS_*] 태그를 실제 발행 모습과
// 비슷하게 꾸며서 보여준다. 편집 모드(textarea)는 원본 태그 그대로 편집해야 하므로 대상 아님.
const BLOCK_TAG_REGEX = /\[(QUOTE_VERTICAL|QUOTE_DEFAULT|QUOTE_POSTIT|QUOTE_BALLOON|QUOTE_LINE_QUOTATION|QUOTE_FRAME)\]([\s\S]*?)\[\/\1\]|\[IMAGE_ANCHOR_(\d+)\]|\[BUSINESS_MAP_BLOCK\]|\[BUSINESS_CTA_BANNER\]/gi;

function renderInlineText(text, keyPrefix) {
    const parts = text.split(/(\[B\][\s\S]*?\[\/B\])/gi);
    return parts.map((part, i) => {
        const m = part.match(/^\[B\]([\s\S]*?)\[\/B\]$/i);
        if (m) {
            return <strong key={`${keyPrefix}-b-${i}`} style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{m[1]}</strong>;
        }
        return part || null;
    });
}

function renderQuoteBlock(styleKey, text, key) {
    const styleInfo = QUOTE_STYLES.find(s => s.key === styleKey);
    const label = styleInfo?.label || styleKey;
    const baseBox = { margin: '20px 0', position: 'relative' };

    switch (styleKey) {
        case 'QUOTE_VERTICAL':
            return (
                <div key={key} style={{ ...baseBox, padding: '4px 0 4px 18px', borderLeft: '4px solid var(--accent)' }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{text}</span>
                </div>
            );
        case 'QUOTE_DEFAULT':
            return (
                <div key={key} style={{ ...baseBox, textAlign: 'center', padding: '10px 24px' }}>
                    <span style={{ fontSize: 26, color: 'var(--accent)', marginRight: 6, verticalAlign: '-4px' }}>❝</span>
                    <span style={{ fontSize: 17, fontWeight: 700, fontStyle: 'italic', color: 'var(--text-primary)' }}>{text}</span>
                </div>
            );
        case 'QUOTE_POSTIT':
            return (
                <div key={key} style={{
                    ...baseBox, display: 'inline-block', padding: '14px 20px', borderRadius: 4,
                    background: 'rgba(250, 204, 21, 0.14)', border: '1px solid rgba(250, 204, 21, 0.35)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', transform: 'rotate(-0.6deg)'
                }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{text}</span>
                </div>
            );
        case 'QUOTE_BALLOON':
            return (
                <div key={key} style={{
                    ...baseBox, display: 'inline-block', padding: '12px 22px', borderRadius: 22,
                    background: 'rgba(27,67,50,0.12)', border: '1.5px solid var(--accent)'
                }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>💬 {text}</span>
                </div>
            );
        case 'QUOTE_LINE_QUOTATION':
            return (
                <div key={key} style={{ ...baseBox, padding: '4px 4px 10px', borderBottom: '2px solid var(--border)' }}>
                    <span style={{ fontSize: 15, color: 'var(--text-muted)', marginRight: 6 }}>—</span>
                    <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{text}</span>
                </div>
            );
        case 'QUOTE_FRAME':
            return (
                <div key={key} style={{
                    ...baseBox, padding: '14px 20px', borderRadius: 10,
                    border: '1.5px solid var(--border)', background: 'rgba(255,255,255,0.02)'
                }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{text}</span>
                </div>
            );
        default:
            return (
                <div key={key} style={baseBox}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>[{label}]</span> {text}
                </div>
            );
    }
}

function renderPlaceholderBlock(key, icon, label) {
    return (
        <div key={key} style={{
            margin: '16px 0', padding: '14px 18px', borderRadius: 10,
            border: '1px dashed var(--border)', background: 'rgba(255,255,255,0.02)',
            fontSize: 12, color: 'var(--text-muted)', textAlign: 'center'
        }}>
            {icon} {label}
        </div>
    );
}

function renderPreviewBody(body) {
    if (!body) return null;
    const regex = new RegExp(BLOCK_TAG_REGEX.source, 'gi');
    const nodes = [];
    let lastIndex = 0;
    let key = 0;
    let match;
    while ((match = regex.exec(body)) !== null) {
        if (match.index > lastIndex) {
            const plain = body.slice(lastIndex, match.index);
            if (plain) nodes.push(...renderInlineText(plain, `t-${key++}`));
        }
        const [full, quoteStyle, quoteText, anchorNum] = match;
        if (quoteStyle) {
            nodes.push(renderQuoteBlock(quoteStyle.toUpperCase(), quoteText.trim(), `q-${key++}`));
        } else if (anchorNum) {
            nodes.push(renderPlaceholderBlock(`img-${key++}`, '🖼️', `이미지 ${anchorNum} 삽입 위치`));
        } else if (/BUSINESS_MAP_BLOCK/i.test(full)) {
            nodes.push(renderPlaceholderBlock(`map-${key++}`, '📍', '업체 지도 영역'));
        } else if (/BUSINESS_CTA_BANNER/i.test(full)) {
            nodes.push(renderPlaceholderBlock(`cta-${key++}`, '🔗', 'CTA 배너 영역'));
        }
        lastIndex = match.index + full.length;
    }
    if (lastIndex < body.length) {
        const plain = body.slice(lastIndex);
        if (plain) nodes.push(...renderInlineText(plain, `t-${key++}`));
    }
    return nodes;
}

function extractSubheadings(body) {
    const results = [];
    const regex = new RegExp(QUOTE_TAG_PATTERN.source, 'gi');
    let match;
    while ((match = regex.exec(body)) !== null) {
        results.push({
            style: match[1].toUpperCase(),
            text: match[2].trim(),
            fullMatch: match[0],
            startIndex: match.index,
        });
    }
    return results;
}

function QuoteStyleModal({ body, onClose, onApply }) {
    const subheadings = extractSubheadings(body);
    const [selectedIdx, setSelectedIdx] = useState(null);
    const [selectedStyle, setSelectedStyle] = useState(null);

    const handleSelectHeading = (i) => {
        setSelectedIdx(i);
        setSelectedStyle(subheadings[i].style);
    };

    const handleApply = () => {
        if (selectedIdx === null || !selectedStyle) return;
        const h = subheadings[selectedIdx];
        const newTag = `[${selectedStyle}]${h.text}[/${selectedStyle}]`;
        const newBody = body.substring(0, h.startIndex) + newTag + body.substring(h.startIndex + h.fullMatch.length);
        onApply(newBody);
        setSelectedIdx(null);
        setSelectedStyle(null);
    };

    const canApply = selectedIdx !== null && selectedStyle && selectedStyle !== subheadings[selectedIdx]?.style;

    return createPortal(
        <div
            onClick={e => e.target === e.currentTarget && onClose()}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
            <div style={{ width: '100%', maxWidth: 860, maxHeight: '85vh', background: 'var(--bg-secondary)', borderRadius: 20, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
                {/* 헤더 */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <div>
                        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>소제목 인용구 설정</h2>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>소제목을 선택하고 원하는 인용구 스타일로 변경하세요</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, lineHeight: 1 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                </div>

                {/* 바디 — 좌/우 분할 */}
                <div className="bm-grid bm-grid-half" style={{ flex: 1, overflow: 'auto', minHeight: 0, gap: 0 }}>
                    {/* 왼쪽: 소제목 리스트 */}
                    <div style={{ padding: '20px 24px', borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>
                            소제목 목록 ({subheadings.length}개)
                        </p>
                        {subheadings.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>원고에 소제목이 없습니다.</p>
                        ) : subheadings.map((h, i) => {
                            const styleInfo = QUOTE_STYLES.find(s => s.key === h.style);
                            const isSelected = selectedIdx === i;
                            return (
                                <div
                                    key={i}
                                    onClick={() => handleSelectHeading(i)}
                                    style={{
                                        padding: '12px 14px', borderRadius: 10, marginBottom: 8, cursor: 'pointer',
                                        background: isSelected ? 'rgba(27,67,50,0.12)' : 'rgba(0,0,0,0.15)',
                                        border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 5, lineHeight: 1.4 }}>
                                        {h.text}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>현재:</span>
                                        <span style={{
                                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                                            background: 'rgba(27,67,50,0.15)', color: 'var(--accent)',
                                        }}>
                                            {styleInfo?.icon} {styleInfo?.label || h.style}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 오른쪽: 스타일 선택 */}
                    <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>
                            {selectedIdx !== null ? `"${subheadings[selectedIdx]?.text}" — 스타일 선택` : '← 소제목을 먼저 선택하세요'}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {QUOTE_STYLES.map(style => {
                                const isActive = selectedStyle === style.key;
                                const isCurrent = selectedIdx !== null && subheadings[selectedIdx]?.style === style.key;
                                return (
                                    <div
                                        key={style.key}
                                        onClick={() => selectedIdx !== null && setSelectedStyle(style.key)}
                                        style={{
                                            padding: '14px 16px', borderRadius: 10, cursor: selectedIdx !== null ? 'pointer' : 'not-allowed',
                                            opacity: selectedIdx === null ? 0.35 : 1,
                                            background: isActive ? 'rgba(27,67,50,0.12)' : 'rgba(0,0,0,0.15)',
                                            border: `1.5px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                                            transition: 'all 0.15s',
                                            display: 'flex', alignItems: 'center', gap: 14,
                                        }}
                                    >
                                        <span style={{ fontSize: 20, lineHeight: 1, width: 28, textAlign: 'center', flexShrink: 0 }}>{style.icon}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? 'var(--accent)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {style.label}
                                                {isCurrent && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 100, background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>현재</span>}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{style.desc}</div>
                                        </div>
                                        {isActive && (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3"><path d="M20 6 9 17l-5-5"/></svg>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 푸터 */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
                    <button onClick={onClose} className="btn-secondary" style={{ fontSize: 13, padding: '9px 20px' }}>닫기</button>
                    <button
                        onClick={handleApply}
                        disabled={!canApply}
                        style={{
                            fontSize: 13, fontWeight: 700, padding: '9px 24px', borderRadius: 10, border: 'none',
                            background: canApply ? 'var(--accent)' : 'rgba(27,67,50,0.3)',
                            color: canApply ? '#fff' : 'rgba(255,255,255,0.35)',
                            cursor: canApply ? 'pointer' : 'not-allowed', transition: 'background 0.15s',
                        }}
                    >
                        적용
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

const TOPIC_GROUPS = [
    {
        name: "엔터테인먼트·예술",
        topics: ["문학·책", "영화", "미술·디자인", "공연·전시", "음악", "드라마", "스타·연예인", "만화·애니", "방송"]
    },
    {
        name: "생활·노하우·쇼핑",
        topics: ["일상·생각", "육아·결혼", "반려동물", "좋은글·이미지", "패션·미용", "인테리어·DIY", "요리·레시피", "상품리뷰", "원예·재배"]
    },
    {
        name: "취미·여가·여행",
        topics: ["게임", "스포츠", "사진", "자동차", "취미", "국내여행", "세계여행", "맛집"]
    },
    {
        name: "지식·동향",
        topics: ["IT·컴퓨터", "사회·정치", "건강·의학", "비즈니스·경제", "어학·외국어", "교육·학문"]
    }
];

function NewPostContent() {
    const { isSubscribed, freeTrialCount, loading: subLoading } = useSubscription();
    const [showGateModal, setShowGateModal] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [form, setForm] = useState({
        naver_account_id: '',
        trigger_type: 'manual',
        topic: '',
        reference_url: '',
        category: '여행',
        image_option: 'ai',
        schedule_type: 'now',
        scheduled_at: '',
        // 글 말투
        seo_category: '친근한 존댓말',
        // Keyword Config
        main_keyword: '',
        sub_keywords: '',
        min_volume: '',
        max_volume: '',
        custom_instructions: '', // New field for custom guide
        // Publish Options
        publish_options: {
            category_id: '',
            topic_id: '0',
            visibility: 'all',
            allow_comments: true,
            allow_likes: true,
            allow_search: true,
            allow_share: true,
            allow_external: true,
            is_notice: false,
            use_map: false,
            map_address: ''
        }
    });
    const [loading, setLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previews, setPreviews] = useState([]);
    const [activePreviewIdx, setActivePreviewIdx] = useState(0);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');
    const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
    const [showPublishNotice, setShowPublishNotice] = useState(false);
    const publishNoticeResolveRef = useRef(null);
    const [tempTopic, setTempTopic] = useState('0');
    const [isCatOpen, setIsCatOpen] = useState(false);
    const [instructionPresets, setInstructionPresets] = useState([]);
    const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
    const [presetMenuPos, setPresetMenuPos] = useState(null);
    const presetButtonRef = useRef(null);
    const [presetPendingDeleteId, setPresetPendingDeleteId] = useState(null);
    const [isAddingNewPreset, setIsAddingNewPreset] = useState(false);
    const [newPresetContent, setNewPresetContent] = useState('');
    const [imageAssets, setImageAssets] = useState(Array.from({ length: 8 }, () => ({ file: null, preview: null, description: '', mediaType: 'image' })));
    
    // Address Search States
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    
    const [currentPostId, setCurrentPostId] = useState(null);
    const [realtimePost, setRealtimePost] = useState(null);
    const [progressLogs, setProgressLogs] = useState([]);
    const [isCancelling, setIsCancelling] = useState(false);
    const [processingStartTime, setProcessingStartTime] = useState(null);
    const [isEditingPreview, setIsEditingPreview] = useState(false);
    const [postQueue, setPostQueue] = useState([]);
    const executionMode = 'extension';
    const [thumbnailTextMode, setThumbnailTextMode] = useState(false);
    const [thumbnailCustomText, setThumbnailCustomText] = useState('');
    const [thumbnailSubText, setThumbnailSubText] = useState('');
    const [thumbnailStyle, setThumbnailStyle] = useState('center_text');
    const [thumbnailBgType, setThumbnailBgType] = useState('image');
    const [thumbnailBgColor, setThumbnailBgColor] = useState('#8B5CF6');
    const [thumbnailBlackOverlay, setThumbnailBlackOverlay] = useState(30);
    const [thumbnailFont, setThumbnailFont] = useState('bold_gothic');
    const [imageSource, setImageSource] = useState('gemini');
    const [pexelsModalOpen, setPexelsModalOpen] = useState(false);
    const [pexelsModalSlot, setPexelsModalSlot] = useState(null);
    const [pexelsModalTemp, setPexelsModalTemp] = useState(null);
    const [quoteModalOpen, setQuoteModalOpen] = useState(false);

    const POST_SESSION_KEY = 'blog_post_session';
    const DRAFT_KEY = 'blog_draft_state';
    const isDraftLoaded = useRef(false);

    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        if (subLoading) return; // 구독 여부가 확정된 뒤 한 번만 로드 (비구독자용 예시 계정 깜빡임 방지)
        const loadAccounts = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: fetched } = await supabase.from('naver_accounts').select('id, naver_id, concept, custom_content_prompt').eq('user_id', user?.id);
            const data = isSubscribed ? (fetched || []) : [DEMO_ACCOUNT, ...(fetched || [])];
            setAccounts(data);

            // 저장된 초안 복원 시도
            try {
                const saved = localStorage.getItem(DRAFT_KEY);
                if (saved) {
                    const draft = JSON.parse(saved);
                    if (draft.previews?.length > 0 || draft.form?.topic || draft.form?.main_keyword) {
                        const savedAccountId = draft.form?.naver_account_id;
                        const accountValid = data?.some(a => a.id === savedAccountId);
                        setForm(f => ({
                            ...f,
                            ...draft.form,
                            naver_account_id: accountValid ? savedAccountId : (data?.[0]?.id || ''),
                        }));
                        if (draft.previews?.length > 0) setPreviews(draft.previews);
                        if (typeof draft.activePreviewIdx === 'number') setActivePreviewIdx(draft.activePreviewIdx);
                        // URL ?topic= 파라미터가 있으면 드래프트보다 우선 적용 (추천 키워드 클릭 시
                        // 주제뿐 아니라 핵심 키워드 심화설정에도 동일한 키워드를 채워 SEO 타겟을 고정한다)
                        const quickTopic = new URLSearchParams(window.location.search).get('topic');
                        if (quickTopic) setForm(f => ({ ...f, topic: quickTopic, main_keyword: quickTopic }));
                        isDraftLoaded.current = true;
                        return;
                    }
                }
            } catch (_) {}

            // 초안 없음: 기본 계정만 설정
            if (data?.length > 0) setForm(f => ({ ...f, naver_account_id: data[0].id }));

            // URL ?topic= 파라미터로 키워드 자동 입력 (추천 키워드 클릭 시)
            // 주제뿐 아니라 핵심 키워드 심화설정에도 동일한 키워드를 채워 SEO 타겟을 고정한다
            const quickTopic = new URLSearchParams(window.location.search).get('topic');
            if (quickTopic) setForm(f => ({ ...f, topic: quickTopic, main_keyword: quickTopic }));

            isDraftLoaded.current = true;
        };
        loadAccounts();
    }, [subLoading]);

    useEffect(() => {
        const fetchCategories = async () => {
            if (!form.naver_account_id) return;
            try {
                const res = await fetch(`/api/accounts/categories?accountId=${form.naver_account_id}`);
                const data = await res.json();
                if (data.categories) {
                    setCategories(data.categories);
                    if (data.categories.length > 0) {
                        setForm(f => ({ ...f, publish_options: { ...f.publish_options, category_id: data.categories[0].id, category_name: data.categories[0].name || '' } }));
                    }
                }
            } catch (err) {
                console.error("Failed to fetch categories", err);
            }
        };
        fetchCategories();
    }, [form.naver_account_id]);

    useEffect(() => {
        const fetchInstructionPresets = async () => {
            if (!form.naver_account_id) { setInstructionPresets([]); return; }
            const { data, error } = await supabase.from('custom_instruction_presets')
                .select('id, content, created_at')
                .eq('naver_account_id', form.naver_account_id)
                .order('created_at', { ascending: false });
            if (!error) setInstructionPresets(data || []);
        };
        fetchInstructionPresets();
        setIsPresetMenuOpen(false);
        setIsAddingNewPreset(false);
        setNewPresetContent('');
    }, [form.naver_account_id]);

    useEffect(() => {
        setImageSource('gemini');
    }, [form.naver_account_id]);

    const handleAddNewPreset = async () => {
        const content = newPresetContent.trim();
        if (!content || !form.naver_account_id) return;
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.from('custom_instruction_presets')
            .insert({ user_id: user.id, naver_account_id: form.naver_account_id, content })
            .select('id, content, created_at').single();
        if (!error && data) {
            setInstructionPresets(prev => [data, ...prev]);
            setNewPresetContent('');
            setIsAddingNewPreset(false);
        }
    };

    const handleConfirmDeletePreset = async () => {
        const id = presetPendingDeleteId;
        setPresetPendingDeleteId(null);
        if (!id) return;
        const { error } = await supabase.from('custom_instruction_presets').delete().eq('id', id);
        if (!error) setInstructionPresets(prev => prev.filter(p => p.id !== id));
    };

    useEffect(() => {
        if (!isPresetMenuOpen) return;
        const close = () => setIsPresetMenuOpen(false);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [isPresetMenuOpen]);

    const searchParams = useSearchParams();
    const urlPostId = searchParams.get('id');

    // 마운트 시 localStorage에 저장된 진행 중 포스트 복원
    useEffect(() => {
        try {
            const saved = localStorage.getItem(POST_SESSION_KEY);
            if (!saved) return;
            const session = JSON.parse(saved);
            if (!session?.currentPostId) return;
            // 진행 중 상태일 때만 복원
            const activeStatuses = ['pending', 'scheduled', 'generating', 'posting', 'pending_extension'];
            if (session.realtimePost && activeStatuses.includes(session.realtimePost.status)) {
                setCurrentPostId(session.currentPostId);
                setRealtimePost(session.realtimePost);
                setProgressLogs(session.progressLogs || []);
                setProcessingStartTime(session.processingStartTime || null);
            } else {
                localStorage.removeItem(POST_SESSION_KEY);
            }
        } catch (_) {}
    }, []);

    // URL 파라미터(?id=...)로 전달된 포스트 로드 — 최근 포스팅 목록에서 클릭 시 해당 워크스페이스 상태 복원
    useEffect(() => {
        if (!urlPostId) return;

        const loadPostFromUrl = async () => {
            try {
                const res = await fetch(`/api/posts/${urlPostId}/status`);
                if (!res.ok) return;
                const data = await res.json();
                setCurrentPostId(urlPostId);
                setRealtimePost(data);

                if (data.progress) {
                    setProgressLogs([{ ...data.progress, timestamp: new Date().toISOString() }]);
                }

                // 백엔드에 저장된 원고(title, content, hashtags 등)가 있으면 미리보기 카드로 즉시 대입
                if (data.content_json && (data.content_json.title || data.content_json.content)) {
                    const loadedPreview = {
                        _pre_generated: true,
                        title: data.content_json.title || data.topic || '',
                        body: data.content_json.content || data.content_json.body || '',
                        hashtags: data.content_json.hashtags || [],
                        image_prompts: data.content_json.image_prompts || [],
                        thumbnail_text: data.content_json.thumbnail_text || null,
                        thumbnail_sub_text: data.content_json.thumbnail_sub_text || null,
                        seo_stats: data.content_json.seo_guidelines || {},
                        media_meta: data.content_json.media_meta || null,
                    };
                    setPreviews([loadedPreview]);
                    setActivePreviewIdx(0);
                }

                if (data.topic) {
                    const cleanTopic = data.topic.split('|||')[0];
                    setForm(f => ({ ...f, topic: cleanTopic, main_keyword: cleanTopic }));
                }

                if (data.naver_account_id) {
                    setForm(f => ({ ...f, naver_account_id: data.naver_account_id }));
                }
            } catch (e) {
                console.error('[Load Post From URL Error]', e);
            }
        };

        loadPostFromUrl();
    }, [urlPostId]);

    // 진행 중인 포스트 상태를 localStorage에 저장
    useEffect(() => {
        if (!currentPostId) return;
        const activeStatuses = ['pending', 'scheduled', 'generating', 'posting', 'pending_extension'];
        if (realtimePost && ['success', 'failed'].includes(realtimePost.status)) {
            localStorage.removeItem(POST_SESSION_KEY);
            return;
        }
        if (realtimePost && activeStatuses.includes(realtimePost.status)) {
            try {
                localStorage.setItem(POST_SESSION_KEY, JSON.stringify({
                    currentPostId,
                    realtimePost,
                    progressLogs,
                    processingStartTime,
                }));
            } catch (_) {}
        }
    }, [currentPostId, realtimePost, progressLogs, processingStartTime]);

    // 초안 자동 저장 — 탭 이동 후에도 원고/입력값 유지
    useEffect(() => {
        if (!isDraftLoaded.current) return;
        if (!previews.length && !form.topic && !form.main_keyword && !form.reference_url) {
            try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
            return;
        }
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, previews, activePreviewIdx }));
        } catch (_) {}
    }, [form, previews, activePreviewIdx]);

    // 온보딩 투어가 "새 포스팅"에서 시작되면, 미리보기/무료 이미지 선택 관련 스텝들이
    // 실제로 화면에 나타나도록 예시 원고 + 예시 Pexels 후보를 미리 채워 넣는다.
    // 이미 진행 중인 실제 원고가 있으면 건드리지 않는다.
    useEffect(() => {
        const handler = (e) => {
            if (e.detail?.pageKey !== 'post') return;
            if (previews.length > 0) return;

            const demoSlots = [
                { desc: '맛집 외관과 간판', seed: 'a' },
                { desc: '시그니처 메뉴 클로즈업', seed: 'b' },
                { desc: '아늑한 매장 내부', seed: 'c' },
            ].map((s, i) => ({
                index: i,
                korean_description: s.desc,
                query: s.desc,
                photos: [1, 2, 3].map(n => ({
                    id: `demo-${s.seed}-${n}`,
                    url: `https://picsum.photos/seed/bmdemo-${s.seed}${n}/480/320`,
                    photographer: `예시 작가 ${n}`,
                })),
            }));
            const demoSelected = {};
            demoSlots.forEach(slot => {
                demoSelected[slot.index] = { ...slot.photos[0], thumbnail: slot.photos[0].url };
            });

            setImageSource('stock');
            setIsEditingPreview(false);
            setPreviews([{
                ...DEMO_DRAFT,
                image_prompts: demoSlots.map(s => s.korean_description),
                pexelsCandidates: demoSlots,
                selectedPexels: demoSelected,
                pexelsLoading: false,
                _isOnboardingDemo: true, // 투어 종료 시 이 예시 원고만 골라서 지우기 위한 표시
            }]);
            setActivePreviewIdx(0);
        };
        window.addEventListener(ONBOARDING_START_EVENT, handler);
        return () => window.removeEventListener(ONBOARDING_START_EVENT, handler);
    }, [previews]);

    // 온보딩 투어가 끝나면(완료/닫기/다시보지않기 어떤 경로든), 위에서 채워둔 예시 원고가
    // 아직 그대로 남아있을 때만 지운다 — 투어 중 실제로 원고를 생성했다면 그건 건드리지 않는다.
    const handleOnboardingEnd = () => {
        if (previews.length === 1 && previews[0]?._isOnboardingDemo) {
            setPreviews([]);
            setImageSource('gemini'); // 투어를 위해 자동으로 바꿨던 것도 함께 원상복구
        }
    };

    const MEDIA_SIZE_LIMITS = { image: 5, video: 50, gif: 10 };

    // 현재 활성 탭 미리보기 (derived — pexels 상태도 preview 객체 내에 포함)
    const previewData = previews[activePreviewIdx] ?? null;
    const pexelsCandidates = previewData?.pexelsCandidates ?? null;
    const selectedPexels = previewData?.selectedPexels ?? {};
    const pexelsLoading = previewData?.pexelsLoading ?? false;

    const handleFileChange = (index, e) => {
        const file = e.target.files[0];
        if (!file) return;
        const mediaType = imageAssets[index].mediaType || 'image';
        const limitMB = MEDIA_SIZE_LIMITS[mediaType] || 5;
        if (file.size > limitMB * 1024 * 1024) {
            setError(`파일 용량이 너무 큽니다. ${mediaType === 'video' ? '동영상' : mediaType === 'gif' ? 'GIF' : '이미지'}는 ${limitMB}MB 이하로 업로드해 주세요.`);
            return;
        }

        const newAssets = [...imageAssets];
        newAssets[index] = {
            ...newAssets[index],
            file,
            preview: URL.createObjectURL(file)
        };
        setImageAssets(newAssets);
        setError('');
    };

    const toggleMediaType = (index) => {
        const cycle = { image: 'video', video: 'gif', gif: 'image' };
        const newAssets = [...imageAssets];
        newAssets[index] = {
            ...newAssets[index],
            mediaType: cycle[newAssets[index].mediaType || 'image'],
            file: null,
            preview: null
        };
        setImageAssets(newAssets);
    };

    const handleDescriptionChange = (index, val) => {
        const newAssets = [...imageAssets];
        newAssets[index].description = val;
        setImageAssets(newAssets);
    };

    const addImageAsset = () => {
        if (imageAssets.length >= 50) {
            setError('최대 50개까지만 등록할 수 있습니다.');
            return;
        }
        setImageAssets([...imageAssets, { file: null, preview: null, description: '', mediaType: 'image' }]);
    };

    const removeImageAsset = (index) => {
        if (imageAssets.length <= 8) {
            setError('최소 8개의 슬롯이 필요합니다. 파일만 삭제하려면 해당 슬롯을 클릭해 다시 선택하세요.');
            return;
        }
        setImageAssets(imageAssets.filter((_, i) => i !== index));
    };

    const openPexelsModal = (slotIndex) => {
        setPexelsModalSlot(slotIndex);
        setPexelsModalTemp(selectedPexels[slotIndex] || null);
        setPexelsModalOpen(true);
    };

    const handlePexelsModalSave = () => {
        if (pexelsModalTemp && pexelsModalSlot !== null) {
            setPreviews(prev => {
                const next = [...prev];
                if (next[activePreviewIdx]) {
                    next[activePreviewIdx] = {
                        ...next[activePreviewIdx],
                        selectedPexels: { ...next[activePreviewIdx].selectedPexels, [pexelsModalSlot]: pexelsModalTemp }
                    };
                }
                return next;
            });
        }
        setPexelsModalOpen(false);
        setPexelsModalSlot(null);
        setPexelsModalTemp(null);
    };

    const handlePexelsModalCancel = () => {
        setPexelsModalOpen(false);
        setPexelsModalSlot(null);
        setPexelsModalTemp(null);
    };

    const handleSearchPlace = async () => {
        if (!searchQuery.trim()) return;
        setSearchResults([]);
        setIsSearching(true);
        try {
            const res = await fetch(`/api/naver/search-place?query=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setSearchResults(data);
        } catch (err) {
            console.error("Search failed", err);
            setError("장소 검색에 실패했습니다.");
        } finally {
            setIsSearching(false);
        }
    };

    // 참조 이미지를 Vercel API 라우트로 Base64 전송하지 않고 브라우저에서 Supabase
    // Storage로 직접 업로드한다 (Vercel 서버리스 함수의 ~4.5MB 요청 본문 제한 회피).
    // 업로드된 URL만 가볍게 백엔드로 전달되고, 실제 이미지 바이트는 브라우저→Supabase로
    // 직접 이동한다. references/ 경로에는 Storage 정책으로 업로드 권한이 부여돼 있어야 함
    // (20260710000000_allow_authenticated_upload_reference_images.sql 참고).
    const uploadReferenceImagesToStorage = async (files) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('로그인 정보를 확인할 수 없습니다.');

        return Promise.all(files.map(async (file, i) => {
            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
            // 밀리초 타임스탬프 + 순번 조합이라 실질적으로 경로 충돌이 없음 — upsert 불필요.
            // (upsert:true는 Postgres RLS가 INSERT/UPDATE 정책을 모두 요구해서 계속
            //  거부되는 문제가 있었음. 충돌 가능성이 사실상 없으니 순수 INSERT로 우회)
            const path = `references/${user.id}/${Date.now()}_${i}.${ext}`;
            const { error } = await supabase.storage
                .from('blogmaster-images')
                .upload(path, file, { contentType: file.type });
            if (error) throw new Error(`이미지 업로드 실패: ${toKoreanErrorMessage(error)}`);
            const { data: { publicUrl } } = supabase.storage.from('blogmaster-images').getPublicUrl(path);
            return publicUrl;
        }));
    };


    // Reliable polling from engine API
    useEffect(() => {
        if (!currentPostId) return;
        let stopped = false;

        const poll = async () => {
            try {
                const res = await fetch(`/api/posts/${currentPostId}/status`);
                if (!res.ok) return;
                const data = await res.json();

                setRealtimePost(data);

                if (data.progress) {
                    // Log to browser developer console for user debugging
                    console.log(`[Automation Progress] ${data.progress.step}: ${data.progress.message} (${data.progress.percent}%)${data.progress.detail ? ' - ' + data.progress.detail : ''}`);

                    setProgressLogs(prev => {
                        const last = prev[prev.length - 1];
                        if (last && last.message === data.progress.message) return prev;
                        return [...prev, { ...data.progress, timestamp: new Date().toISOString() }];
                    });
                }

                // Stop polling if done
                if (['success', 'failed'].includes(data.status)) {
                    stopped = true;
                    try { localStorage.removeItem('blog_post_session'); } catch (_) {}
                    return;
                }
            } catch (e) {
                console.error('[Polling] Error:', e.message);
            }

            if (!stopped) setTimeout(poll, 2000);
        };

        poll();
        return () => { stopped = true; };
    }, [currentPostId]);

    // 발행 완료/실패 시 대기열에 있는 다음 포스트 자동 실행
    useEffect(() => {
        const isDone = realtimePost && ['success', 'failed'].includes(realtimePost.status);
        if (!isDone || postQueue.length === 0) return;

        const next = postQueue[0];
        setPostQueue(prev => prev.slice(1));

        fetch('/api/post/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ post_id: next.id })
        }).catch(err => console.error('[Queue Trigger]', err.message));

        setCurrentPostId(next.id);
        setRealtimePost({ id: next.id, status: 'pending' });
        setProgressLogs([]);
        setProcessingStartTime(Date.now());
    }, [realtimePost?.status, postQueue]);

    // 확장프로그램 대기 중(80%)일 때 크롬 익스텐션으로 즉시 폴링 메시지(BLOGMASTER_POLL_NOW)를 발송하여 Service Worker를 깨움
    useEffect(() => {
        if (realtimePost?.status !== 'pending_extension') return;

        const triggerPoll = () => {
            window.postMessage({ type: 'BLOGMASTER_POLL_NOW' }, '*');
        };
        triggerPoll();
        const interval = setInterval(triggerPoll, 3000);
        return () => clearInterval(interval);
    }, [realtimePost?.status]);

    const handleReset = () => {
        setPreviews([]);
        setActivePreviewIdx(0);
        setForm(f => ({
            ...f,
            topic: '',
            reference_url: '',
            main_keyword: '',
            sub_keywords: '',
            custom_instructions: '',
        }));
        try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
    };

    // 비구독 체험 사용자용: 실제 API(M1+M2+M3)를 호출하지 않고 DEMO_DRAFT를
    // 청크 단위로 previews[idx].body에 흘려 넣어 AI가 실시간으로 작성 중인 것처럼 보여준다.
    // previews 배열 shape을 handlePreview와 동일하게 맞춰서 기존 미리보기 렌더링 로직을 그대로 재사용한다.
    const handlePreviewDemo = async () => {
        setPreviewLoading(true);
        setError('');

        const newPreview = { ...DEMO_DRAFT, body: '', pexelsCandidates: null, selectedPexels: {}, pexelsLoading: false };
        const newIdx = previews.length;
        setPreviews(prev => [...prev, newPreview]);
        setActivePreviewIdx(newIdx);
        setIsEditingPreview(false);

        const fullBody = DEMO_DRAFT.body;
        await new Promise(resolve => {
            let cursor = 0;
            const step = () => {
                cursor += 6;
                const chunkText = fullBody.slice(0, cursor);
                setPreviews(prev => {
                    const next = [...prev];
                    if (next[newIdx]) next[newIdx] = { ...next[newIdx], body: chunkText };
                    return next;
                });
                if (cursor < fullBody.length) setTimeout(step, 25);
                else resolve();
            };
            step();
        });

        setPreviewLoading(false);
    };

    const handlePreview = async () => {
        if (!isSubscribed && freeTrialCount <= 0) {
            setShowGateModal(true);
            return;
        }
        if (!form.topic && form.trigger_type === 'manual') {
            setError('주제가 되는 내용을 입력해 주세요.');
            return;
        }
        if (form.trigger_type === 'image_reference') {
            const uploadedCount = imageAssets.filter(a => a.file).length;
            if (uploadedCount < 8) return setError(`미디어를 8개 모두 업로드해 주세요. (현재 ${uploadedCount}/8)`);
            const hasDesc = imageAssets.some(a => a.description.trim());
            if (!hasDesc) return setError('미디어에 대한 설명을 최소 하나는 입력해 주세요.');
        }
        
        setPreviewLoading(true);
        setError('');
        try {
            let finalForm = { ...form };
            let mediaMeta = null;

            if (form.trigger_type === 'image_reference') {
                console.log("[Hybrid] Uploading reference images to Supabase Storage");
                const assetsWithFiles = imageAssets.filter(a => a.file);
                const uploadedUrls = await uploadReferenceImagesToStorage(assetsWithFiles.map(a => a.file));
                finalForm.reference_url = uploadedUrls.join(',');
                mediaMeta = uploadedUrls.map((url, i) => ({
                    path: url,
                    mediaType: assetsWithFiles[i].mediaType || 'image',
                    mimeType: assetsWithFiles[i].file.type
                }));
                const descs = imageAssets.map(a => a.description).filter(d => d);
                finalForm.topic = descs.join('\n\n');
            }

            const thumbnailConfig = thumbnailTextMode ? {
                enabled: true,
                type: 'custom',
                custom_text: thumbnailCustomText,
                sub_text: thumbnailSubText,
                style: thumbnailStyle,
                text_color: 'white',
                bg_type: thumbnailBgType,
                bg_color: thumbnailBgColor,
                black_overlay: thumbnailBlackOverlay,
                font: thumbnailFont
            } : { enabled: false };

            // 1. 비동기 원고 생성 시작
            const startRes = await fetchWithAuthRetry('/api/post/preview-start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...finalForm, _media_meta: mediaMeta, thumbnail_text_config: thumbnailConfig, image_source: imageSource })
            });
            const startData = await startRes.json();
            if (startData.error) throw new Error(startData.error);
            const { preview_id } = startData;

            // 2. 완료될 때까지 폴링 (3초 간격)
            let attempts = 0;
            while (attempts < 120) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                const statusRes = await fetchWithAuthRetry(`/api/post/preview-status/${preview_id}`);
                const statusData = await statusRes.json();
                if (statusData.status === 'done') {
                    const result = statusData.result;
                    const hasPexels = imageSource === 'stock' && (result.image_prompts?.length > 0);
                    const newPreview = {
                        ...result,
                        thumbnail_text: result.thumbnail_text || null,
                        pexelsCandidates: null,
                        selectedPexels: {},
                        pexelsLoading: hasPexels
                    };
                    const newIdx = previews.length;
                    setPreviews(prev => [...prev, newPreview]);
                    setActivePreviewIdx(newIdx);
                    setIsEditingPreview(false);

                    // 무료 이미지 모드: 원고의 image_prompts로 Pexels 후보 조회
                    if (hasPexels) {
                        try {
                            const pexelsRes = await fetch('/api/pexels/candidates', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ image_prompts: result.image_prompts })
                            });
                            const pexelsData = await pexelsRes.json();
                            if (pexelsData.candidates) {
                                setPreviews(prev => {
                                    const next = [...prev];
                                    if (next[newIdx]) next[newIdx] = { ...next[newIdx], pexelsCandidates: pexelsData.candidates };
                                    return next;
                                });
                            }
                        } catch (pe) {
                            console.error('[Pexels] 후보 조회 실패:', pe.message);
                        } finally {
                            setPreviews(prev => {
                                const next = [...prev];
                                if (next[newIdx]) next[newIdx] = { ...next[newIdx], pexelsLoading: false };
                                return next;
                            });
                        }
                    }
                    break;
                }
                if (statusData.status === 'error') throw new Error(statusData.error || '원고 생성 실패');
                attempts++;
            }
            if (attempts >= 120) throw new Error('원고 생성 시간이 초과되었습니다. 다시 시도해주세요.');
        } catch (err) {
            setError('미리보기 생성 실패: ' + toKoreanErrorMessage(err));
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleStop = async () => {
        if (!currentPostId) return;
        setIsCancelling(true);
        try {
            // Directly update DB — engine checks this on every isCancelled() call
            await supabase.from('posts').update({ status: 'failed', error_message: '사용자에 의해 취소됨' }).eq('id', currentPostId);
            // Force local state update so UI shows failed immediately
            setRealtimePost(prev => prev ? { ...prev, status: 'failed', error_message: '사용자에 의해 취소됨' } : prev);
        } finally {
            setIsCancelling(false);
        }
    };

    const checkNaverLogin = () => new Promise((resolve) => {
        const timeout = setTimeout(() => resolve('no_extension'), 2000);
        const handler = (event) => {
            if (event.data?.type !== 'BLOGMASTER_NAVER_LOGIN_STATUS') return;
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            if (event.data.contextInvalidated) resolve('context_invalidated');
            else if (event.data.noExtension) resolve('no_extension');
            else resolve(event.data.loggedIn ? 'logged_in' : 'not_logged_in');
        };
        window.addEventListener('message', handler);
        window.postMessage({ type: 'BLOGMASTER_CHECK_NAVER_LOGIN' }, '*');
    });

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();

        if (!isSubscribed) {
            setShowGateModal(true);
            return;
        }

        const naverStatus = await checkNaverLogin();
        if (naverStatus === 'context_invalidated') {
            setError('확장프로그램이 업데이트되었습니다. 페이지를 새로고침(F5) 후 다시 시도해 주세요.');
            return;
        }
        if (naverStatus === 'not_logged_in') {
            setError('네이버에 로그인되어 있지 않습니다. 같은 브라우저에서 네이버에 먼저 로그인해 주세요.');
            return;
        }
        if (naverStatus === 'no_extension') {
            setError('Blog Master 확장프로그램이 연결되어 있지 않습니다. 확장프로그램을 먼저 연결해 주세요.');
            return;
        }

        if (form.schedule_type === 'now' && !isProcessing) {
            const proceed = await new Promise((resolve) => {
                publishNoticeResolveRef.current = resolve;
                setShowPublishNotice(true);
            });
            if (!proceed) return;
        }

        setLoading(true);
        setError('');

        const { data: { user } } = await supabase.auth.getUser();

        let baseTopic = form.topic;

        if (form.trigger_type === 'ai_recommend') {
            // const selectedAccount = accounts.find(a => a.id === form.naver_account_id);
            // const concept = selectedAccount?.concept || form.category;
            baseTopic = form.category;
        }

        let imageUrl = null;
        let activePreviewData = previewData;

        if (form.trigger_type === 'image_reference' && !previewData?._pre_generated) {
            // Unified logic: 참조 이미지를 Supabase Storage에 직접 업로드하고 URL만 전달
            console.log("[Hybrid] No/Stale preview data found. Uploading reference images and generating silently...");
            try {
                const assetsWithFiles = imageAssets.filter(a => a.file);
                const uploadedUrls = await uploadReferenceImagesToStorage(assetsWithFiles.map(a => a.file));
                const mediaMetaForSubmit = uploadedUrls.map((url, i) => ({
                    path: url,
                    mediaType: assetsWithFiles[i].mediaType || 'image',
                    mimeType: assetsWithFiles[i].file.type
                }));
                const descs = imageAssets.map(a => a.description).filter(d => d);

                const res = await fetch('/api/post/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...form, reference_url: uploadedUrls.join(','), _media_meta: mediaMetaForSubmit, topic: descs.join('\n\n') })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                
                imageUrl = data.reference_url;
                activePreviewData = {
                    _pre_generated: true,
                    title: data.title,
                    body: data.body,
                    hashtags: data.hashtags,
                    image_prompts: data.image_prompts,
                    thumbnail_text: data.thumbnail_text || null,
                    seo_stats: data.seo_stats,
                    data_asset: data.data_asset,
                    reference_url: data.reference_url,
                    media_meta: data.media_meta || null,
                };
                baseTopic = descs.join('\n\n');
            } catch (err) {
                setError('이미지 처리 중 오류가 발생했습니다: ' + toKoreanErrorMessage(err));
                setLoading(false);
                return;
            }
        } else if (previewData?._pre_generated) {
            // 이미 프리뷰를 거친 경우, 프리뷰 응답에 포함된 reference_url(로컬 경로 또는 URL)을 사용
            imageUrl = previewData.reference_url || form.reference_url;
        }

        let finalTopic = baseTopic;
        const thumbnailConfig = thumbnailTextMode ? {
            enabled: true,
            type: 'custom',
            custom_text: thumbnailCustomText,
            sub_text: thumbnailSubText,
            style: thumbnailStyle,
            text_color: 'white',
            bg_type: thumbnailBgType,
            bg_color: thumbnailBgColor,
            black_overlay: thumbnailBlackOverlay,
            font: thumbnailFont
        } : { enabled: false };
        if (form.main_keyword || form.sub_keywords || form.min_volume || form.max_volume || form.custom_instructions || form.publish_options || form.seo_category || thumbnailTextMode || imageSource !== 'gemini') {
            finalTopic += `|||${JSON.stringify({
                main_keyword: form.main_keyword,
                sub_keywords: form.sub_keywords,
                min_volume: form.min_volume,
                max_volume: form.max_volume,
                custom_instructions: form.custom_instructions,
                publish_options: form.publish_options,
                seo_category: form.seo_category,
                thumbnail_text_config: thumbnailConfig,
                image_source: imageSource
            })}`;
        }

        // 확장 프로그램 device_id를 INSERT 전에 미리 수집해 스케줄러 간섭을 차단
        let extensionDeviceId = null;
        if (executionMode === 'extension' && !isProcessing) {
            extensionDeviceId = await new Promise((resolve) => {
                const timeout = setTimeout(() => resolve(null), 2000);
                const handler = (event) => {
                    if (event.data?.type === 'BLOGMASTER_DEVICE_ID_RESPONSE') {
                        clearTimeout(timeout);
                        window.removeEventListener('message', handler);
                        resolve(event.data.deviceId || null);
                    }
                };
                window.addEventListener('message', handler);
                window.postMessage({ type: 'BLOGMASTER_GET_DEVICE_ID' }, '*');
            });
            console.log('[Extension] device_id:', extensionDeviceId || '없음 (익스텐션 미설치?)');
        }

        const postData = {
            user_id: user.id,
            naver_account_id: form.naver_account_id,
            trigger_type: form.trigger_type === 'image_reference' ? 'manual' : form.trigger_type,
            topic: finalTopic,
            reference_url: form.trigger_type === 'image_reference' ? (imageUrl || form.reference_url) : null,
            category: form.category,
            status: form.schedule_type === 'now' ? 'pending' : 'scheduled',
            scheduled_at: form.schedule_type === 'scheduled' ? new Date(form.scheduled_at).toISOString() : null,
            content_json: activePreviewData ? {
                _pre_generated: true,  // Flag so engine knows to skip M1+M2
                _trigger_type: form.trigger_type,
                title: activePreviewData.title,
                content: activePreviewData.body || activePreviewData.content,
                hashtags: activePreviewData.hashtags || [],
                image_prompts: activePreviewData.image_prompts || [],
                thumbnail_text: activePreviewData.thumbnail_text || null,
                thumbnail_sub_text: thumbnailSubText || null,
                thumbnail_style: thumbnailStyle,
                thumbnail_text_color: 'white',
                thumbnail_bg_type: thumbnailBgType,
                thumbnail_bg_color: thumbnailBgColor,
                seo_guidelines: activePreviewData.seo_stats || activePreviewData.seo_guidelines || {},
                data_asset: activePreviewData.data_asset || {},
                image_source: imageSource,
                // 무료 이미지 모드: 사용자가 선택한 Pexels 이미지 URL 목록 (슬롯 순서대로)
                selected_pexels_images: imageSource === 'stock'
                    ? (activePreviewData.image_prompts || []).map((_, i) => selectedPexels[i]?.url || null).filter(Boolean)
                    : undefined,
                // image_reference 타입만 실제 이미지 경로를 저장 — url_reference의 기사 URL이 섞이지 않도록
                reference_url: form.trigger_type === 'image_reference' ? (imageUrl || activePreviewData.reference_url || null) : null,
                media_meta: activePreviewData.media_meta || null,
            } : {
                _trigger_type: form.trigger_type,
                image_source: imageSource
            },
            ...(extensionDeviceId ? { extension_device_id: extensionDeviceId } : {})
        };

        const { data, error: insertError } = await supabase.from('posts').insert(postData).select().single();

        if (insertError) {
            setError(toKoreanErrorMessage(insertError));
            setLoading(false);
        } else {
            setLoading(false);

            setIsEditingPreview(false);

            if (isProcessing) {
                // 현재 발행 중 → 대기열에 추가 (트리거 안 함)
                setPostQueue(prev => [...prev, { id: data.id }]);
            } else {
                setCurrentPostId(data.id);
                setRealtimePost(data);
                setProcessingStartTime(Date.now());

                if (executionMode === 'extension') {
                    fetch('/api/post/prepare-extension', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ post_id: data.id, extension_device_id: extensionDeviceId })
                    }).catch(err => console.error('[Extension Prepare Error]', err.message));
                }
                // else {
                //     // 서버(Puppeteer) 모드
                //     fetch('/api/post/trigger', {
                //         method: 'POST',
                //         headers: { 'Content-Type': 'application/json' },
                //         body: JSON.stringify({ post_id: data.id })
                //     }).catch(err => console.error('[Trigger Error]', err.message));
                // }
            }
        }
    };

    const aiCategories = ['여행', '일상', '맛집', '리뷰', '건강', '재테크', 'IT', '육아', '반려동물'];

    if (submitted) {
        return (
            <div className="animate-in" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: 60, marginBottom: 20 }}>✅</div>
                <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>포스팅이 성공적으로 예약되었습니다!</h1>
                <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
                    {form.schedule_type === 'now' ? '잠시 후 블로그에 포스팅이 완료됩니다.' : `${form.scheduled_at}에 발행될 예정입니다.`}
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button type="button" className="btn-secondary" onClick={() => router.push('/dashboard')}>대시보드로 이동</button>
                    <button type="button" className="btn-primary" onClick={() => {
                        setSubmitted(false);
                        setCurrentPostId(null);
                        setRealtimePost(null);
                        setForm({ ...form, topic: '' });
                        try { localStorage.removeItem('blog_post_session'); } catch (_) {}
                    }}>새 포스팅 만들기</button>
                </div>
            </div>
        );
    }

    const isProcessing = realtimePost && ['pending', 'scheduled', 'generating', 'posting', 'pending_extension'].includes(realtimePost.status);
    const isSuccess = realtimePost?.status === 'success';
    const isFailed = realtimePost?.status === 'failed';
    const isExtensionPosting = realtimePost?.status === 'posting' && executionMode === 'extension';
    const isWaitingExtension = realtimePost?.status === 'pending_extension';

    // 10분 이상 processing 상태가 지속되면 강제 닫기 허용
    const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;
    const isProcessingTimedOut = isProcessing && processingStartTime && (Date.now() - processingStartTime > PROCESSING_TIMEOUT_MS);

    // Progress comes from polling useEffect above (stored in React state, not DB realtime)
    const lastLog = progressLogs[progressLogs.length - 1] || null;
    const currentStep = isWaitingExtension
        ? '확장프로그램 대기 중 — 크롬 팝업을 열어두세요'
        : isExtensionPosting
        ? '확장프로그램이 네이버에 발행 중...'
        : lastLog?.step || (isProcessing ? '전송을 준비하고 있습니다...' : '');
    const progressPercentage = lastLog?.percent || (isWaitingExtension ? 80 : 0);
    const timeRemaining = lastLog?.timeRemaining || '계산 중...';

    return (
        <div className="animate-in post-workspace" style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>새 포스팅 워크스페이스</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                        AI와 실시간으로 소통하며 완벽한 네이버 블로그 포스팅을 완성하세요.
                    </p>
                    {!isSubscribed && (
                        <div style={{
                            marginTop: 8,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 14px',
                            borderRadius: 20,
                            background: freeTrialCount > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            border: freeTrialCount > 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                            fontSize: 13,
                            fontWeight: 700,
                            color: freeTrialCount > 0 ? '#10b981' : '#ef4444'
                        }}>
                            <span>🎁 무료 체험 혜택</span>
                            <span>·</span>
                            <span>남은 원고 생성 횟수: {freeTrialCount}회 / 3회</span>
                            {freeTrialCount <= 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowGateModal(true)}
                                    style={{
                                        marginLeft: 6,
                                        padding: '3px 10px',
                                        borderRadius: 12,
                                        background: 'linear-gradient(135deg, #1b4332, #2d6a4f)',
                                        color: '#fff',
                                        border: 'none',
                                        fontSize: 11,
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                    }}
                                >
                                    무제한 플랜 구독하기 →
                                </button>
                            )}
                        </div>
                    )}
                </div>
                {(previews.length > 0 || form.topic || form.main_keyword) && (
                    <button type="button" className="btn-secondary" onClick={handleReset}
                        style={{ fontSize: 13, padding: '8px 16px', flexShrink: 0 }}>
                        초기화
                    </button>
                )}
            </div>

            <div className="bm-grid bm-grid-workspace" style={{
                gap: 24,
                flex: 1,
                minHeight: 0
            }}>
                {/* Left Pane: Input Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', paddingRight: 8 }}>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {/* 네이버 계정 */}
                        <div data-tour="post-account-select" className="glass-card" style={{ padding: '24px' }}>
                            {/* Account Row */}
                            <div>
                                <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, display: 'block', fontWeight: 600 }}>
                                    네이버 계정
                                </label>
                                <select className="select-field" value={form.naver_account_id}
                                    onChange={e => setForm({ ...form, naver_account_id: e.target.value })} required>
                                    {accounts.map(a => (
                                        <option key={a.id} value={a.id}>{displayNaverId(a.naver_id)} ({a.concept})</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* 글 말투 */}
                        <div data-tour="post-tone" className="glass-card" style={{ padding: '24px' }}>
                            <div>
                                <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, display: 'block', fontWeight: 600 }}>
                                    글 말투
                                </label>
                                {(() => {
                                    const selectedAccount = accounts.find(a => a.id === form.naver_account_id);
                                    const hasCustomPrompt = !!(selectedAccount?.custom_content_prompt?.trim());
                                    return (
                                        <div className="bm-grid bm-grid-3" style={{ gap: 8 }}>
                                            {[
                                                { value: '친근한 존댓말', icon: '😊', desc: '일상·리뷰' },
                                                { value: '여성적인 말투', icon: '💕', desc: '감성·공감형' },
                                                { value: '남성적인 말투', icon: '💪', desc: '간결·정보형' },
                                                { value: '일상체', icon: '😂', desc: '~했음·ㅋㅋ' },
                                                { value: '건강·의학', icon: '🏥', desc: '전문 정보형' },
                                                { value: '나의 프롬프트', icon: '✨', desc: hasCustomPrompt ? '내 계정 설정' : '계정에서 설정 필요', disabled: !hasCustomPrompt },
                                            ].map(cat => (
                                                <button key={cat.value} type="button"
                                                    disabled={cat.disabled}
                                                    onClick={() => !cat.disabled && setForm({ ...form, seo_category: cat.value })}
                                                    title={cat.disabled ? '네이버 계정 관리 > 프롬프트 설정에서 먼저 나만의 프롬프트를 등록해주세요.' : undefined}
                                                    style={{
                                                        padding: '10px 6px', borderRadius: 10, border: '1px solid',
                                                        borderColor: form.seo_category === cat.value ? 'var(--accent)' : 'var(--border)',
                                                        background: form.seo_category === cat.value ? 'rgba(27,67,50,0.15)' : 'var(--bg-secondary)',
                                                        color: cat.disabled ? 'var(--text-muted)' : (form.seo_category === cat.value ? 'var(--accent)' : 'var(--text-secondary)'),
                                                        cursor: cat.disabled ? 'not-allowed' : 'pointer', textAlign: 'center', fontSize: 12, fontWeight: 600,
                                                        opacity: cat.disabled ? 0.5 : 1,
                                                        transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4
                                                    }}>
                                                    <span style={{ fontSize: 18 }}>{cat.icon}</span>
                                                    <span>{cat.value}</span>
                                                    <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{cat.desc}</span>
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })()}

                                {/* 말투 미리보기 */}
                                {(() => {
                                    const tonePreview = {
                                        '친근한 존댓말': {
                                            label: '친근한 존댓말',
                                            color: '#1b4332',
                                            bg: 'rgba(27,67,50,0.07)',
                                            border: 'rgba(27,67,50,0.25)',
                                            lines: [
                                                '오늘은 제가 직접 다녀온 곳을 소개해 드릴게요 😊',
                                                '솔직히 처음엔 별 기대 안 했는데, 가보니까 진짜 너무 좋더라고요.',
                                                '이런 분들이라면 한 번쯤 꼭 가보셨으면 좋겠어요!',
                                            ],
                                        },
                                        '여성적인 말투': {
                                            label: '여성적인 말투',
                                            color: '#ec4899',
                                            bg: 'rgba(236,72,153,0.07)',
                                            border: 'rgba(236,72,153,0.25)',
                                            lines: [
                                                '처음 봤을 때부터 너무 예쁘고 설레더라고요 💕',
                                                '분위기가 정말 따뜻하고 포근해서 완전 제 스타일이었어요 🌸',
                                                '같이 간 친구도 또 오고 싶다고 했을 정도로 대만족이에요 ✨',
                                            ],
                                        },
                                        '남성적인 말투': {
                                            label: '남성적인 말투',
                                            color: '#0ea5e9',
                                            bg: 'rgba(14,165,233,0.07)',
                                            border: 'rgba(14,165,233,0.25)',
                                            lines: [
                                                '결론부터 말하면 가성비는 확실히 된다.',
                                                '직접 써본 입장에서 장점 세 가지, 단점 하나를 정리했다.',
                                                '굳이 찾아갈 만한 곳이냐고 묻는다면, 그렇다 👍',
                                            ],
                                        },
                                        '일상체': {
                                            label: '일상체 (음슴체)',
                                            color: '#f59e0b',
                                            bg: 'rgba(245,158,11,0.07)',
                                            border: 'rgba(245,158,11,0.25)',
                                            lines: [
                                                '갑자기 생각나서 갔다 왔는데 진짜 대박이었음 ㅋㅋ',
                                                '솔직히 기대 별로 안 했는데 완전 취향저격이었음 😋',
                                                '결론은 강추임. 안 가면 후회할 것 같아서 올리는 거임 ㅎㅎ',
                                            ],
                                        },
                                        '건강·의학': {
                                            label: '건강·의학 (전문 정보형)',
                                            color: '#10b981',
                                            bg: 'rgba(16,185,129,0.07)',
                                            border: 'rgba(16,185,129,0.25)',
                                            lines: [
                                                '많은 분들이 일상에서 겪는 증상임에도 놓치기 쉬운 경우가 있습니다.',
                                                '원인·증상·예방법을 단계적으로 살펴보겠습니다.',
                                                '증상이 지속된다면 반드시 전문의 상담을 받아보시기 바랍니다.',
                                            ],
                                        },
                                    };
                                    let preview = tonePreview[form.seo_category];
                                    if (form.seo_category === '나의 프롬프트') {
                                        const selectedAccount = accounts.find(a => a.id === form.naver_account_id);
                                        const customText = selectedAccount?.custom_content_prompt?.trim();
                                        preview = customText ? {
                                            label: '나의 프롬프트',
                                            color: '#8b5cf6',
                                            bg: 'rgba(139,92,246,0.07)',
                                            border: 'rgba(139,92,246,0.25)',
                                            lines: [customText],
                                        } : null;
                                    }
                                    if (!preview) return null;
                                    return (
                                        <div style={{
                                            marginTop: 12,
                                            padding: '14px 16px',
                                            borderRadius: 12,
                                            background: preview.bg,
                                            border: `1px solid ${preview.border}`,
                                        }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: preview.color, marginBottom: 8, letterSpacing: 0.3 }}>
                                                ✏️ {preview.label} 미리보기
                                            </div>
                                            {preview.lines.map((line, i) => (
                                                <div key={i} style={{
                                                    fontSize: 12.5,
                                                    color: 'var(--text-primary)',
                                                    lineHeight: 1.7,
                                                    paddingLeft: 8,
                                                    borderLeft: i === 0 ? `2px solid ${preview.color}` : '2px solid transparent',
                                                    marginBottom: i < preview.lines.length - 1 ? 4 : 0,
                                                    opacity: i === 0 ? 1 : 0.75,
                                                }}>
                                                    {line}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* 컨텐츠 생성 방식 */}
                        <div data-tour="post-mode-buttons" className="glass-card" style={{ padding: '24px' }}>
                            <div>
                                <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, display: 'block', fontWeight: 600 }}>
                                    컨텐츠 생성 방식
                                </label>
                                <div className="bm-grid bm-grid-3" style={{ gap: 10 }}>
                                    {[
                                        { value: 'ai_recommend', icon: <Icons.Sparkles />, label: 'AI 추천' },
                                        { value: 'manual', icon: <Icons.PenTool />, label: '직접 입력' },
                                        { value: 'image_reference', icon: <Icons.Image />, label: '이미지 참조' },
                                    ].map(opt => (
                                        <button key={opt.value} type="button"
                                            onClick={() => setForm({ ...form, trigger_type: opt.value })}
                                            style={{
                                                padding: '12px 8px', borderRadius: 12, border: '1px solid',
                                                borderColor: form.trigger_type === opt.value ? 'var(--accent)' : 'var(--border)',
                                                background: form.trigger_type === opt.value ? 'rgba(27,67,50,0.1)' : 'var(--bg-secondary)',
                                                color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'center',
                                                transition: 'all 0.2s ease',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6
                                            }}>
                                            <div style={{ transform: 'scale(0.9)', opacity: form.trigger_type === opt.value ? 1 : 0.6 }}>{opt.icon}</div>
                                            <div style={{ fontSize: 11, fontWeight: 600 }}>{opt.label}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* 이미지 생성 방식 (AI 추천 / 직접 입력에서만 표시) — 썸네일 TEXT 토글도 이 카드 안에서 노출 */}
                        {(form.trigger_type === 'ai_recommend' || form.trigger_type === 'manual') && (
                            <div className="glass-card" style={{ padding: '24px' }}>
                                <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, display: 'block', fontWeight: 600 }}>
                                    이미지 생성 방식
                                </label>

                                <div data-tour="post-thumbnail-toggle" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 12 }}>
                                    <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                                        썸네일 TEXT 이미지 생성
                                    </label>
                                    <button type="button"
                                        onClick={() => setThumbnailTextMode(v => !v)}
                                        style={{
                                            padding: '4px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                            border: '1px solid',
                                            borderColor: thumbnailTextMode ? 'var(--accent)' : 'var(--border)',
                                            background: thumbnailTextMode ? 'rgba(27,67,50,0.15)' : 'var(--bg-secondary)',
                                            color: thumbnailTextMode ? 'var(--accent)' : 'var(--text-muted)',
                                            cursor: 'pointer', transition: 'all 0.2s'
                                        }}>
                                        {thumbnailTextMode ? '켜짐' : '꺼짐'}
                                    </button>
                                </div>

                                {thumbnailTextMode && (
                                    <div style={{ marginBottom: 16, padding: '16px', background: 'rgba(27,67,50,0.05)', borderRadius: 12, border: '1px solid rgba(27,67,50,0.2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {/* 제목 입력 */}
                                        <div>
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>제목</div>
                                            <input
                                                className="input-field"
                                                type="text"
                                                placeholder="썸네일에 표시할 제목을 입력하세요"
                                                value={thumbnailCustomText}
                                                onChange={e => setThumbnailCustomText(e.target.value)}
                                            />
                                        </div>
                                        {/* 소제목 입력 */}
                                        <div>
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>소제목</div>
                                            <input
                                                className="input-field"
                                                type="text"
                                                placeholder="썸네일에 표시할 소제목을 입력하세요"
                                                value={thumbnailSubText}
                                                onChange={e => setThumbnailSubText(e.target.value)}
                                            />
                                        </div>

                                        {/* 배경 선택 */}
                                        <div>
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>배경 선택</div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                {[
                                                    { value: 'image', label: '이미지' },
                                                    { value: 'color', label: '색상' },
                                                ].map(opt => (
                                                    <button key={opt.value} type="button"
                                                        onClick={() => setThumbnailBgType(opt.value)}
                                                        style={{
                                                            flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                                                            border: '1px solid',
                                                            borderColor: thumbnailBgType === opt.value ? 'var(--accent)' : 'var(--border)',
                                                            background: thumbnailBgType === opt.value ? 'rgba(27,67,50,0.15)' : 'var(--bg-secondary)',
                                                            color: thumbnailBgType === opt.value ? 'var(--accent)' : 'var(--text-secondary)',
                                                            cursor: 'pointer', transition: 'all 0.2s'
                                                        }}>
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                            {thumbnailBgType === 'color' && (() => {
                                                const presetColors = ['#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#14B8A6'];
                                                const isCustomColor = !presetColors.map(c => c.toLowerCase()).includes(thumbnailBgColor.toLowerCase());
                                                return (
                                                    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                                        {presetColors.map(color => (
                                                            <button key={color} type="button"
                                                                onClick={() => setThumbnailBgColor(color)}
                                                                style={{
                                                                    width: 32, height: 32, borderRadius: '50%',
                                                                    background: color, border: 'none', cursor: 'pointer',
                                                                    outline: thumbnailBgColor.toLowerCase() === color.toLowerCase() ? '3px solid var(--accent)' : '2px solid transparent',
                                                                    outlineOffset: 2, transition: 'outline 0.15s'
                                                                }} />
                                                        ))}
                                                        <div style={{
                                                            position: 'relative', width: 32, height: 32,
                                                            outline: isCustomColor ? '3px solid var(--accent)' : '2px solid transparent',
                                                            outlineOffset: 2, borderRadius: '50%', transition: 'outline 0.15s'
                                                        }}>
                                                            <input type="color" value={thumbnailBgColor}
                                                                onChange={e => setThumbnailBgColor(e.target.value)}
                                                                style={{
                                                                    width: 32, height: 32, borderRadius: '50%',
                                                                    border: 'none', cursor: 'pointer', padding: 0,
                                                                    background: isCustomColor ? thumbnailBgColor : 'none',
                                                                    display: 'block'
                                                                }}
                                                                title="직접 선택" />
                                                            {isCustomColor && (
                                                                <div style={{
                                                                    position: 'absolute', inset: 0, borderRadius: '50%',
                                                                    background: thumbnailBgColor, pointerEvents: 'none'
                                                                }} />
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* 블랙 투명도 */}
                                        <div>
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>블랙 투명도</div>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {[0, 20, 40, 60, 80].map(val => (
                                                    <button key={val} type="button"
                                                        onClick={() => setThumbnailBlackOverlay(val)}
                                                        style={{
                                                            flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                                            border: '1px solid',
                                                            borderColor: thumbnailBlackOverlay === val ? 'var(--accent)' : 'var(--border)',
                                                            background: thumbnailBlackOverlay === val ? 'rgba(27,67,50,0.15)' : 'var(--bg-secondary)',
                                                            color: thumbnailBlackOverlay === val ? 'var(--accent)' : 'var(--text-secondary)',
                                                            cursor: 'pointer', transition: 'all 0.2s'
                                                        }}>
                                                        {val}%
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* 글꼴 선택 */}
                                        <div>
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>글꼴</div>
                                            <div className="bm-grid bm-grid-half" style={{ gap: 8 }}>
                                                {[
                                                    { value: 'bold_gothic', label: '굵은 고딕', desc: '강렬·모던' },
                                                    { value: 'elegant_serif', label: '우아한 명조', desc: '클래식·고급' },
                                                    { value: 'rounded_sans', label: '둥근 고딕', desc: '친근·부드러움' },
                                                    { value: 'handwritten', label: '손글씨체', desc: '감성·캐주얼' },
                                                ].map(font => (
                                                    <button key={font.value} type="button"
                                                        onClick={() => setThumbnailFont(font.value)}
                                                        style={{
                                                            padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                                            border: '1px solid',
                                                            borderColor: thumbnailFont === font.value ? 'var(--accent)' : 'var(--border)',
                                                            background: thumbnailFont === font.value ? 'rgba(27,67,50,0.15)' : 'var(--bg-secondary)',
                                                            color: thumbnailFont === font.value ? 'var(--accent)' : 'var(--text-secondary)',
                                                            cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center'
                                                        }}>
                                                        <div>{font.label}</div>
                                                        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{font.desc}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* 텍스트 배치 방식 선택 카드 */}
                                        <div style={{ marginTop: 4 }}>
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4 }}>텍스트 배치 방식</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>AI가 아래 레이아웃으로 썸네일을 디자인합니다</div>
                                            <div className="bm-grid bm-grid-half" style={{ gap: 8 }}>
                                                {[
                                                    {
                                                        value: 'center_text',
                                                        label: '① 정중앙',
                                                        preview: (
                                                            <div style={{ width: '100%', height: 72, borderRadius: 6, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(160deg,rgba(58,90,138,${1 - thumbnailBlackOverlay/100}),rgba(90,122,170,${1 - thumbnailBlackOverlay/100}))`, backgroundColor: `rgba(0,0,0,${thumbnailBlackOverlay/100})` }}>
                                                                <div style={{ textAlign: 'center', padding: '0 8px' }}>
                                                                    <div style={{ color: '#fff', fontSize: 10, fontWeight: 900, textShadow: '0 0 6px rgba(0,0,0,1)', letterSpacing: 0.2, lineHeight: 1.3 }}>
                                                                        {thumbnailCustomText || '제목 텍스트'}
                                                                    </div>
                                                                    <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 7.5, marginTop: 4, fontWeight: 400, textShadow: '0 0 5px rgba(0,0,0,1)' }}>
                                                                        {thumbnailSubText || '소제목 텍스트'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    },
                                                    {
                                                        value: 'bottom_left',
                                                        label: '② 좌측 하단',
                                                        preview: (
                                                            <div style={{ width: '100%', height: 72, background: 'linear-gradient(160deg,#3a6a4a,#5a8a6a)', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
                                                                <div style={{ position: 'absolute', bottom: 8, left: 8, textAlign: 'left' }}>
                                                                    <div style={{ color: '#fff', fontSize: 10, fontWeight: 900, textShadow: '0 0 6px rgba(0,0,0,1)', letterSpacing: 0.2 }}>
                                                                        {thumbnailCustomText || '제목 텍스트'}
                                                                    </div>
                                                                    <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 7.5, marginTop: 2, fontWeight: 400, textShadow: '0 0 5px rgba(0,0,0,1)' }}>
                                                                        {thumbnailSubText || '소제목 텍스트'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    },
                                                    {
                                                        value: 'center_box',
                                                        label: '③ 중앙 박스',
                                                        preview: (
                                                            <div style={{ width: '100%', height: 72, background: 'linear-gradient(160deg,#5a4a8a,#7a6aaa)', borderRadius: 6, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <div style={{ border: '1.5px solid rgba(255,255,255,0.9)', borderRadius: 4, padding: '5px 12px', textAlign: 'center' }}>
                                                                    <div style={{ color: '#fff', fontSize: 10, fontWeight: 900, textShadow: '0 0 4px rgba(0,0,0,0.8)' }}>
                                                                        {thumbnailCustomText || '제목 텍스트'}
                                                                    </div>
                                                                    <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: 7.5, marginTop: 2, fontWeight: 400 }}>
                                                                        {thumbnailSubText || '소제목 텍스트'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    },
                                                    {
                                                        value: 'bottom_right',
                                                        label: '④ 우측 하단',
                                                        preview: (
                                                            <div style={{ width: '100%', height: 72, background: 'linear-gradient(160deg,#7a4a3a,#9a6a5a)', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
                                                                <div style={{ position: 'absolute', bottom: 8, right: 8, textAlign: 'right' }}>
                                                                    <div style={{ color: '#fff', fontSize: 10, fontWeight: 900, textShadow: '0 0 5px rgba(0,0,0,0.9)', letterSpacing: 0.2 }}>
                                                                        {thumbnailCustomText || '제목'}
                                                                    </div>
                                                                    <div style={{ color: 'rgba(255,255,255,0.88)', fontSize: 7.5, marginTop: 2, fontWeight: 400, textShadow: '0 0 4px rgba(0,0,0,0.9)' }}>
                                                                        {thumbnailSubText || '소제목'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    },
                                                ].map(card => (
                                                    <button key={card.value} type="button"
                                                        onClick={() => setThumbnailStyle(card.value)}
                                                        style={{
                                                            background: 'none', border: thumbnailStyle === card.value ? '2px solid var(--accent)' : '2px solid var(--border)',
                                                            borderRadius: 10, padding: 6, cursor: 'pointer', textAlign: 'left',
                                                            boxShadow: thumbnailStyle === card.value ? '0 0 0 2px rgba(27,67,50,0.2)' : 'none',
                                                            transition: 'border 0.15s, box-shadow 0.15s'
                                                        }}>
                                                        {card.preview}
                                                        <div style={{ fontSize: 11, fontWeight: 600, color: thumbnailStyle === card.value ? 'var(--accent)' : 'var(--text-secondary)', marginTop: 5, textAlign: 'center' }}>
                                                            {card.label}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div data-tour="post-image-source" className="bm-grid bm-grid-half" style={{ gap: 10 }}>
                                    {[
                                        { value: 'gemini', icon: '🤖', label: 'AI 이미지 생성', desc: 'Gemini로 직접 생성' },
                                        { value: 'stock', icon: '🖼️', label: '무료 이미지', desc: '무료 API로 검색' },
                                    ].map(opt => (
                                        <button key={opt.value} type="button"
                                            onClick={() => setImageSource(opt.value)}
                                            style={{
                                                padding: '12px 8px', borderRadius: 12, border: '1px solid',
                                                borderColor: imageSource === opt.value ? 'var(--accent)' : 'var(--border)',
                                                background: imageSource === opt.value ? 'rgba(27,67,50,0.1)' : 'var(--bg-secondary)',
                                                color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'center',
                                                transition: 'all 0.2s ease',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6
                                            }}>
                                            <span style={{ fontSize: 20 }}>{opt.icon}</span>
                                            <span style={{ fontSize: 12, fontWeight: 700 }}>{opt.label}</span>
                                            <span style={{ fontSize: 10, opacity: 0.6 }}>{opt.desc}</span>
                                        </button>
                                    ))}
                                </div>
                                {imageSource === 'stock' && thumbnailTextMode && (
                                    <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(27,67,50,0.07)', borderRadius: 8, border: '1px solid rgba(27,67,50,0.2)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        💡 썸네일 1번 이미지는 Gemini로 생성되고, 나머지는 무료 이미지로 가져옵니다.
                                    </div>
                                )}

                            </div>
                        )}

                        {/* AI 학습 테마 (AI 추천 모드에서만 표시) */}
                        {form.trigger_type === 'ai_recommend' && (
                            <div className="glass-card" style={{ padding: '24px' }}>
                                <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, display: 'block', fontWeight: 600 }}>
                                    AI 학습 테마
                                    </label>
                                    <select className="select-field" value={form.category}
                                        onChange={e => setForm({ ...form, category: e.target.value })}>
                                        {aiCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                            </div>
                        )}

                        {/* 주제가 되는 내용 */}
                        <div className="glass-card" style={{ padding: '24px' }}>
                            {form.trigger_type === 'ai_recommend' ? (
                                <>
                                    <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, display: 'block', fontWeight: 600 }}>
                                        주제가 되는 내용
                                    </label>
                                    <div style={{ padding: '16px', background: 'rgba(27,67,50,0.05)', borderRadius: 12, border: '1px solid var(--accent)' }}>
                                        <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>
                                            💡 선택한 계정의 컨셉과 카테고리의 최신 트렌드를 분석하여 AI가 알아서 알맞은 주제를 선정하고 작성합니다.
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', fontWeight: 600 }}>
                                            {form.trigger_type === 'image_reference' ? `미디어 및 설명 (필수 8개 / 최대 50개) — ${imageAssets.filter(a => a.file).length}/8 업로드됨` : '주제가 되는 내용'}
                                        </label>
                                        {form.trigger_type === 'image_reference' && imageAssets.length >= 8 && imageAssets.length < 50 && (
                                            <button onClick={addImageAsset} type="button"
                                                style={{ height: 26, padding: '0 8px', borderRadius: 6, background: 'var(--accent)', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Icons.Plus /> 추가
                                            </button>
                                        )}
                                    </div>

                                    {form.trigger_type === 'image_reference' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                                {imageAssets.map((asset, idx) => {
                                                    const mt = asset.mediaType || 'image';
                                                    const acceptMap = { image: 'image/jpeg,image/png,image/webp', video: 'video/mp4,video/quicktime,video/x-msvideo', gif: 'image/gif' };
                                                    const labelMap = { image: '이미지', video: '동영상', gif: 'GIF' };
                                                    const limitMap = { image: '5MB', video: '50MB', gif: '10MB' };
                                                    const typeColorMap = { image: '#1b4332', video: '#10b981', gif: '#f59e0b' };
                                                    return (
                                                    <div key={idx} style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', background: 'rgba(255,255,255,0.02)' }}>
                                                        {/* 삭제 버튼 — 8개 초과 슬롯만 삭제 가능 */}
                                                        {imageAssets.length > 8 && (
                                                            <button onClick={() => removeImageAsset(idx)} type="button"
                                                                style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '11px', background: 'var(--bg-red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <Icons.Trash2 />
                                                            </button>
                                                        )}
                                                        {/* 미디어 타입 전환 버튼 (좌측 상단) */}
                                                        <button onClick={() => toggleMediaType(idx)} type="button"
                                                            title="이미지 → 동영상 → GIF 순으로 전환"
                                                            style={{ position: 'absolute', top: -8, left: -8, height: 22, padding: '0 7px', borderRadius: '11px', background: typeColorMap[mt], color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, border: 'none', cursor: 'pointer' }}>
                                                            {mt === 'image' && <><Icons.Image />{labelMap[mt]}</>}
                                                            {mt === 'video' && <><Icons.Video />{labelMap[mt]}</>}
                                                            {mt === 'gif' && <><Icons.Gif />{labelMap[mt]}</>}
                                                            <Icons.SwitchHorizontal />
                                                        </button>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                            {/* 미디어 업로드 영역 */}
                                                            <div
                                                                onClick={() => document.getElementById(`image-upload-${idx}`).click()}
                                                                style={{
                                                                    height: '140px', border: `2px dashed ${asset.preview ? 'var(--border)' : typeColorMap[mt]}44`, borderRadius: '12px',
                                                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                                    cursor: 'pointer', overflow: 'hidden', background: 'var(--bg-secondary)',
                                                                    transition: 'all 0.2s', position: 'relative'
                                                                }}>
                                                                {asset.preview ? (
                                                                    mt === 'video' ? (
                                                                        <video src={asset.preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
                                                                    ) : (
                                                                        <img src={asset.preview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Preview" />
                                                                    )
                                                                ) : (
                                                                    <>
                                                                        <div style={{ opacity: 0.6, marginBottom: 8, color: typeColorMap[mt] }}>
                                                                            {mt === 'image' && <Icons.Image />}
                                                                            {mt === 'video' && <Icons.Video />}
                                                                            {mt === 'gif' && <Icons.Gif />}
                                                                        </div>
                                                                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{labelMap[mt]} 클릭하여 업로드 (최대 {limitMap[mt]})</p>
                                                                    </>
                                                                )}
                                                                <input id={`image-upload-${idx}`} type="file" hidden accept={acceptMap[mt]} onChange={(e) => handleFileChange(idx, e)} />
                                                            </div>

                                                            {mt === 'gif' && (
                                                                <div style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '6px 10px' }}>
                                                                    ⚠️ GIF는 첫 번째 프레임을 이미지로 변환하여 분석합니다.
                                                                </div>
                                                            )}
                                                            <textarea className="input-field"
                                                                placeholder={`${labelMap[mt]} #${idx + 1}에 대한 설명을 입력하세요.`}
                                                                value={asset.description}
                                                                onChange={e => handleDescriptionChange(idx, e.target.value)}
                                                                required
                                                                rows={2}
                                                                style={{ fontSize: 13, minHeight: '60px' }}
                                                            />
                                                        </div>
                                                    </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <input className="input-field"
                                                placeholder="예: 스위스 7박 9일 유럽여행"
                                                value={form.topic}
                                                onChange={e => setForm({ ...form, topic: e.target.value })}
                                                required
                                            />
                                    )}
                                    <div data-tour="post-custom-instructions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 }}>
                                        <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                                            작성 세부 요청사항 (선택)
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <button type="button"
                                                ref={presetButtonRef}
                                                onClick={() => {
                                                    if (!isPresetMenuOpen && presetButtonRef.current) {
                                                        const rect = presetButtonRef.current.getBoundingClientRect();
                                                        setPresetMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                                    }
                                                    setIsPresetMenuOpen(o => !o);
                                                }}
                                                disabled={!form.naver_account_id}
                                                style={{
                                                    fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8,
                                                    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                                                    color: 'var(--text-secondary)', cursor: form.naver_account_id ? 'pointer' : 'not-allowed',
                                                    display: 'flex', alignItems: 'center', gap: 4
                                                }}>
                                                저장된 요청사항{instructionPresets.length > 0 ? ` (${instructionPresets.length})` : ''}
                                                <Icons.ChevronRight style={{ transform: isPresetMenuOpen ? 'rotate(270deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }} />
                                            </button>
                                            {isPresetMenuOpen && presetMenuPos && createPortal(
                                                <>
                                                <div style={{ position: 'fixed', inset: 0, zIndex: 2000 }} onClick={() => { setIsPresetMenuOpen(false); setIsAddingNewPreset(false); setNewPresetContent(''); }} />
                                                <div style={{
                                                    position: 'fixed', top: presetMenuPos.top, right: presetMenuPos.right, width: 300,
                                                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                                    borderRadius: 10, zIndex: 2001, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden'
                                                }}>
                                                    <div
                                                        onClick={() => {
                                                            setForm(f => ({ ...f, custom_instructions: '' }));
                                                            setIsPresetMenuOpen(false);
                                                        }}
                                                        style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        🗑️ 전체 지우기
                                                    </div>
                                                    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                                                        {instructionPresets.length === 0 ? (
                                                            <div style={{ padding: '14px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                                                                저장된 요청사항이 없습니다
                                                            </div>
                                                        ) : instructionPresets.map(p => (
                                                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                                                                <div
                                                                    onClick={() => {
                                                                        setForm(f => ({
                                                                            ...f,
                                                                            custom_instructions: f.custom_instructions?.trim()
                                                                                ? `${f.custom_instructions}\n${p.content}`
                                                                                : p.content
                                                                        }));
                                                                        setIsPresetMenuOpen(false);
                                                                    }}
                                                                    title={p.content}
                                                                    style={{ flex: 1, fontSize: 12.5, color: 'var(--text-primary)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                                >
                                                                    {p.content.length > 24 ? p.content.slice(0, 24) + '…' : p.content}
                                                                </div>
                                                                <button type="button"
                                                                    onClick={() => setPresetPendingDeleteId(p.id)}
                                                                    title="삭제"
                                                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, fontSize: 13 }}>
                                                                    🗑️
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div style={{ padding: '10px 14px' }}>
                                                        {isAddingNewPreset ? (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                <textarea
                                                                    autoFocus
                                                                    rows={3}
                                                                    placeholder="새로운 요청사항을 입력하세요"
                                                                    value={newPresetContent}
                                                                    onChange={e => setNewPresetContent(e.target.value)}
                                                                    style={{
                                                                        width: '100%', fontSize: 12.5, padding: '8px 10px', borderRadius: 8,
                                                                        border: '1px solid var(--border)', background: 'var(--bg-primary)',
                                                                        color: 'var(--text-primary)', resize: 'vertical'
                                                                    }}
                                                                />
                                                                <div style={{ display: 'flex', gap: 6 }}>
                                                                    <button type="button"
                                                                        onClick={() => { setIsAddingNewPreset(false); setNewPresetContent(''); }}
                                                                        style={{
                                                                            flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                                                            border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer'
                                                                        }}>
                                                                        취소
                                                                    </button>
                                                                    <button type="button"
                                                                        onClick={handleAddNewPreset}
                                                                        disabled={!newPresetContent.trim()}
                                                                        style={{
                                                                            flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                                                            border: '1px solid var(--accent)', background: 'rgba(27,67,50,0.1)', color: 'var(--accent)',
                                                                            cursor: newPresetContent.trim() ? 'pointer' : 'not-allowed',
                                                                            opacity: newPresetContent.trim() ? 1 : 0.5
                                                                        }}>
                                                                        저장
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button type="button"
                                                                onClick={() => setIsAddingNewPreset(true)}
                                                                style={{
                                                                    width: '100%', padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                                                    border: '1px solid var(--accent)', background: 'rgba(27,67,50,0.1)', color: 'var(--accent)',
                                                                    cursor: 'pointer'
                                                                }}>
                                                                + 추가
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                </>,
                                                document.body
                                            )}
                                        </div>
                                    </div>
                                    <textarea className="input-field"
                                        rows={3}
                                        placeholder="예: 가족여행이니 접근성이 좋다는 내용을 꼭 넣어주세요. 단점은 제외해주세요."
                                        value={form.custom_instructions}
                                        onChange={e => setForm({ ...form, custom_instructions: e.target.value })}
                                        style={{ resize: 'vertical' }}
                                    />
                                </>
                            )}
                        </div>

                        {/* 키워드 심화 설정 */}
                        <div data-tour="post-keyword-settings" className="glass-card" style={{ padding: '24px' }}>
                            <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, display: 'block', fontWeight: 600 }}>
                                키워드 심화 설정 (선택 사항)
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div>
                                        <input className="input-field" placeholder="핵심 키워드 (입력 시 자동 추천 안함)"
                                            value={form.main_keyword} onChange={e => setForm({ ...form, main_keyword: e.target.value })} />
                                    </div>
                                    <div>
                                        <input className="input-field" placeholder="서브 키워드 (쉼표로 구분)"
                                            value={form.sub_keywords} onChange={e => setForm({ ...form, sub_keywords: e.target.value })} />
                                    </div>
                                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        * 키워드 입력이 없으면 AI가 검색량 범위에 맞는 최적의 키워드를 자동 추천합니다.
                                    </p>
                            </div>
                        </div>

                        {/* Execution Mode Toggle */}
                        {/* <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: '20px', border: '1px dashed var(--border)' }}>
                            <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, display: 'block', fontWeight: 600 }}>
                                실행 방식
                                </label>
                                <div className="bm-grid bm-grid-half" style={{ gap: 10 }}>
                                    <button type="button"
                                        onClick={() => { setExecutionMode('server'); try { localStorage.setItem('blog_execution_mode', 'server'); } catch (_) {} }}
                                        className={executionMode === 'server' ? 'btn-primary' : 'btn-secondary'}
                                        style={{ padding: '10px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                        서버 발행
                                    </button>
                                    <button type="button"
                                        onClick={() => { setExecutionMode('extension'); try { localStorage.setItem('blog_execution_mode', 'extension'); } catch (_) {} }}
                                        className={executionMode === 'extension' ? 'btn-primary' : 'btn-secondary'}
                                        style={{ padding: '10px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                        확장 프로그램
                                    </button>
                                </div>
                                {executionMode === 'extension' && (
                                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
                                        원고 생성(M1+M2+M3)은 서버에서 처리하고, 최종 발행은 사용자 PC의 크롬 확장 프로그램이 수행합니다. 크롬 확장 프로그램이 설치되어 있어야 합니다.
                                    </p>
                                )}
                        </div> */}

                        {/* 언제 발행할까요? */}
                        <div data-tour="post-schedule-toggle" className="glass-card" style={{ padding: '24px' }}>
                            <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, display: 'block', fontWeight: 600 }}>
                                언제 발행할까요?
                                </label>
                                <div className="bm-grid bm-grid-half" style={{ gap: 10 }}>
                                    <button type="button" onClick={() => setForm({ ...form, schedule_type: 'now' })}
                                        className={form.schedule_type === 'now' ? 'btn-primary' : 'btn-secondary'}
                                        style={{ padding: '10px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                        <Icons.Zap /> 즉시 발행
                                    </button>
                                    <button type="button"
                                        onClick={() => {
                                            const now = new Date();
                                            const defaultDate = new Date(now.getTime() + 60 * 1000 * 60); // 1 hour later
                                            // Round down to 10 mins
                                            defaultDate.setMinutes(Math.floor(defaultDate.getMinutes() / 10) * 10);
                                            defaultDate.setSeconds(0);
                                            defaultDate.setMilliseconds(0);

                                            const localISODate = new Date(defaultDate.getTime() - (defaultDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                                            setForm({ ...form, schedule_type: 'scheduled', scheduled_at: localISODate });
                                        }}
                                        className={form.schedule_type === 'scheduled' ? 'btn-primary' : 'btn-secondary'}
                                        style={{ padding: '10px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                        <Icons.Clock /> 예약 발행
                                    </button>
                                </div>
                                {form.schedule_type === 'scheduled' && (() => {
                                    const todayStr = new Date().toLocaleDateString('en-CA');
                                    const maxDateStr = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString('en-CA');
                                    return (
                                    <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
                                        <div style={{ flex: 2, position: 'relative' }}>
                                            <input type="date" className="input-field"
                                                value={form.scheduled_at.split('T')[0]}
                                                min={todayStr}
                                                max={maxDateStr}
                                                style={{ padding: '10px 12px', fontSize: 13, height: '42px' }}
                                                onChange={e => {
                                                    const parts = form.scheduled_at.split('T');
                                                    const timePart = parts[1] || '00:00';
                                                    setForm({ ...form, scheduled_at: `${e.target.value}T${timePart}` });
                                                }} />
                                        </div>
                                        <div style={{ flex: 1, position: 'relative' }}>
                                            <select className="select-field"
                                                value={form.scheduled_at.split('T')[1]?.split(':')[0] || '00'}
                                                style={{ padding: '10px 12px', fontSize: 13, height: '42px', textAlign: 'center' }}
                                                onChange={e => {
                                                    const parts = form.scheduled_at.split('T');
                                                    const datePart = parts[0];
                                                    const minPart = parts[1]?.split(':')[1] || '00';
                                                    setForm({ ...form, scheduled_at: `${datePart}T${e.target.value}:${minPart}` });
                                                }}>
                                                {Array.from({ length: 24 }).map((_, i) => (
                                                    <option key={i} value={String(i).padStart(2, '0')}>{String(i).padStart(2, '0')}시</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ color: 'var(--text-muted)', fontWeight: 800 }}>:</div>
                                        <div style={{ flex: 1, position: 'relative' }}>
                                            <select className="select-field"
                                                value={form.scheduled_at.split('T')[1]?.split(':')[1] || '00'}
                                                style={{ padding: '10px 12px', fontSize: 13, height: '42px', textAlign: 'center' }}
                                                onChange={e => {
                                                    const parts = form.scheduled_at.split('T');
                                                    const datePart = parts[0];
                                                    const hourPart = parts[1]?.split(':')[0] || '00';
                                                    setForm({ ...form, scheduled_at: `${datePart}T${hourPart}:${e.target.value}` });
                                                }}>
                                                {['00', '10', '20', '30', '40', '50'].map(m => (
                                                    <option key={m} value={m}>{m}분</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    );
                                })()}
                        </div>

                        {/* 네이버 블로그 발행 설정 */}
                        <div className="glass-card" style={{ padding: '24px' }}>
                            <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, display: 'block', fontWeight: 600 }}>
                                네이버 블로그 발행 설정
                                </label>

                                {/* Category */}
                                <div data-tour="post-category" style={{ marginBottom: 16 }}>
                                    <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>블로그 카테고리</label>
                                    {isCatOpen && (
                                        <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setIsCatOpen(false)} />
                                    )}
                                    <div style={{ position: 'relative', zIndex: 100 }}>
                                        <button
                                            type="button"
                                            className="select-field"
                                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'left', padding: '14px 16px', cursor: 'pointer' }}
                                            onClick={() => setIsCatOpen(o => !o)}
                                        >
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {categories.length === 0
                                                    ? '카테고리 불러오는 중...'
                                                    : (categories.find(c => c.id === form.publish_options.category_id)?.name || '카테고리 선택')}
                                            </span>
                                            <Icons.ChevronRight style={{ transform: isCatOpen ? 'rotate(270deg)' : 'rotate(90deg)', transition: 'transform 0.2s', flexShrink: 0, marginLeft: 8 }} />
                                        </button>
                                        {isCatOpen && categories.length > 0 && (
                                            <div style={{
                                                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                                                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                                borderRadius: 10, overflowY: 'auto', maxHeight: 280, zIndex: 101,
                                                boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                                            }}>
                                                {categories.map((c, idx) => (
                                                    <div
                                                        key={c.id}
                                                        onClick={() => {
                                                            setForm(f => ({ ...f, publish_options: { ...f.publish_options, category_id: c.id, category_name: c.name } }));
                                                            setIsCatOpen(false);
                                                        }}
                                                        style={{
                                                            padding: c.isSub ? '9px 16px 9px 28px' : '10px 16px',
                                                            cursor: 'pointer',
                                                            fontSize: c.isSub ? 13 : 14,
                                                            fontWeight: c.isSub ? 400 : 600,
                                                            color: form.publish_options.category_id === c.id
                                                                ? 'var(--accent)'
                                                                : c.isSub ? 'var(--text-secondary)' : 'var(--text-primary)',
                                                            background: form.publish_options.category_id === c.id ? 'rgba(27,67,50,0.12)' : 'transparent',
                                                            display: 'flex', alignItems: 'center', gap: 6,
                                                            borderTop: (!c.isSub && idx > 0) ? '1px solid var(--border)' : 'none',
                                                        }}
                                                        onMouseEnter={e => { if (form.publish_options.category_id !== c.id) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                                        onMouseLeave={e => { if (form.publish_options.category_id !== c.id) e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        {c.isSub && <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>└</span>}
                                                        <span>{c.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Topic - Naver Redesign */}
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>글 주제</label>
                                    <button
                                        type="button"
                                        className="select-field"
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            textAlign: 'left',
                                            padding: '14px 16px'
                                        }}
                                        onClick={() => {
                                            setTempTopic(form.publish_options.topic_id);
                                            setIsTopicModalOpen(true);
                                        }}
                                    >
                                        <span style={{ color: form.publish_options.topic_id === '0' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                            {form.publish_options.topic_id === '0' ? '주제 선택 안 함' : form.publish_options.topic_id}
                                        </span>
                                        <Icons.ChevronRight />
                                    </button>
                                </div>

                                {/* Visibility */}
                                <div data-tour="post-visibility" style={{ marginBottom: 16 }}>
                                    <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>공개 설정</label>
                                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                        {[
                                            { id: 'all', label: '전체공개' },
                                            { id: 'neighbor', label: '이웃공개' },
                                            { id: 'buddy', label: '서로이웃공개' },
                                            { id: 'private', label: '비공개' }
                                        ].map(opt => (
                                            <label key={opt.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <input type="radio" name="visibility" checked={form.publish_options.visibility === opt.id}
                                                    onChange={() => {
                                                        const available = {
                                                            all:      { allow_comments: true, allow_likes: true, allow_search: true, allow_share: true, allow_external: true },
                                                            neighbor: { allow_comments: true, allow_likes: true, allow_search: false, allow_share: true, allow_external: false },
                                                            buddy:    { allow_comments: true, allow_likes: true, allow_search: false, allow_share: true, allow_external: false },
                                                            private:  { allow_comments: true, allow_likes: false, allow_search: false, allow_share: false, allow_external: false },
                                                        };
                                                        const mask = available[opt.id];
                                                        const updated = { ...form.publish_options, visibility: opt.id };
                                                        Object.keys(mask).forEach(k => { if (!mask[k]) updated[k] = false; });
                                                        setForm({ ...form, publish_options: updated });
                                                    }} />
                                                {opt.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Checkbox Options */}
                                <div>
                                    <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>상세 설정</label>
                                    <div className="bm-grid bm-grid-half" style={{ gap: 10 }}>
                                        {(() => {
                                            const vis = form.publish_options.visibility;
                                            const available = {
                                                all:      { allow_comments: true, allow_likes: true, allow_search: true, allow_share: true, allow_external: true },
                                                neighbor: { allow_comments: true, allow_likes: true, allow_search: false, allow_share: true, allow_external: false },
                                                buddy:    { allow_comments: true, allow_likes: true, allow_search: false, allow_share: true, allow_external: false },
                                                private:  { allow_comments: true, allow_likes: false, allow_search: false, allow_share: false, allow_external: false },
                                            };
                                            const mask = available[vis] || available.all;
                                            return [
                                                { id: 'allow_comments', label: '댓글 허용' },
                                                { id: 'allow_likes', label: '공감 허용' },
                                                { id: 'allow_search', label: '검색 허용' },
                                                { id: 'allow_share', label: '블로그/카페 공유 허용' },
                                                { id: 'allow_external', label: '외부 공유 허용' }
                                            ].map(opt => {
                                                const isDisabled = !mask[opt.id];
                                                return (
                                                    <label key={opt.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, opacity: isDisabled ? 0.35 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer' }}>
                                                        <input type="checkbox"
                                                            checked={form.publish_options[opt.id]}
                                                            disabled={isDisabled}
                                                            onChange={e => setForm({
                                                                ...form, publish_options: { ...form.publish_options, [opt.id]: e.target.checked }
                                                            })} />
                                                        {opt.label}
                                                    </label>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>

                                {/* Map Selection */}
                                <div data-tour="post-map" style={{ marginTop: 24, padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 16, border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <label style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <input type="checkbox" checked={form.publish_options.use_map}
                                                onChange={e => setForm({ ...form, publish_options: { ...form.publish_options, use_map: e.target.checked } })} />
                                            장소(지도) 추가
                                        </label>
                                    </div>
                                    
                                    {form.publish_options.use_map && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="animate-in">
                                            <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
                                                <input className="input-field" placeholder="장소명 또는 주소 검색" 
                                                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearchPlace())}
                                                    style={{ flex: 1, padding: '10px 14px', fontSize: 13 }} />
                                                <button type="button" onClick={handleSearchPlace} disabled={isSearching}
                                                    style={{ width: 42, background: 'var(--accent)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                                    {isSearching ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></div> : <Icons.Search />}
                                                </button>
                                            </div>

                                            {/* Selected Address Display */}
                                            {form.publish_options.map_address && (
                                                <div style={{ 
                                                    padding: '8px 12px', 
                                                    background: 'rgba(27,67,50,0.1)', 
                                                    borderRadius: 8, 
                                                    fontSize: 12, 
                                                    border: '1px solid rgba(27,67,50,0.2)', 
                                                    color: 'var(--accent)', 
                                                    fontWeight: 600,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between'
                                                }}>
                                                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: 8 }}>
                                                        선택됨: {form.publish_options.map_address}
                                                    </span>
                                                    <button 
                                                        type="button" 
                                                        onClick={() => {
                                                            setForm({ ...form, publish_options: { ...form.publish_options, map_address: '' } });
                                                            setSearchQuery('');
                                                        }}
                                                        style={{ 
                                                            background: 'transparent', 
                                                            border: 'none', 
                                                            color: 'var(--accent)', 
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            padding: '2px',
                                                            borderRadius: '4px',
                                                            transition: 'background 0.2s',
                                                            flexShrink: 0
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(27,67,50,0.2)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                        title="선택 해제"
                                                    >
                                                        <Icons.X />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Search Results Dropdown */}
                                            {searchResults.length > 0 ? (
                                                <div style={{ 
                                                    maxHeight: 200, overflowY: 'auto', background: 'var(--bg-card)', 
                                                    border: '1px solid var(--border)', borderRadius: 12, marginTop: 4,
                                                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 10
                                                }}>
                                                    {searchResults.map((item, idx) => (
                                                        <div key={idx} onClick={() => {
                                                            setForm({ ...form, publish_options: { ...form.publish_options, map_address: item.roadAddress || item.address } });
                                                            setSearchResults([]);
                                                            setSearchQuery(item.title);
                                                        }}
                                                        style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{item.title}</div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.roadAddress || item.address}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                searchQuery && !isSearching && searchResults.length === 0 && (
                                                    <div style={{ marginTop: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px dashed var(--border)', textAlign: 'center' }}>
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>검색 결과가 없습니다.</div>
                                                        <button type="button" onClick={() => {
                                                            setForm({ ...form, publish_options: { ...form.publish_options, map_address: searchQuery } });
                                                            setSearchResults([]);
                                                        }}
                                                        style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline' }}>
                                                            입력한 내용을 주소로 바로 사용하기
                                                        </button>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>
                        </div>

                        {error && <p style={{ color: 'var(--error)', fontSize: 12 }}>{error}</p>}

                        <div data-tour="post-generate-btn" style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                            <button type="button" className="btn-secondary" style={{ flex: 1, padding: '14px' }}
                                onClick={isSubscribed ? handlePreview : handlePreviewDemo} disabled={previewLoading || loading || accounts.length === 0}>
                                {previewLoading ? '작성 중...' : '원고 생성'}
                            </button>
                            <button type="submit" className="btn-primary" style={{ flex: 1.2, padding: '14px' }}
                                disabled={loading || accounts.length === 0}>
                                {loading ? '처리 중...' : (form.schedule_type === 'now' ? '발행' : '예약 저장')}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Publish Notice Modal — 발행 시작 전 새 탭 자동조작 주의 안내 */}
                {showPublishNotice && createPortal(
                    <div style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 3000,
                        backdropFilter: 'blur(4px)'
                    }}>
                        <div className="glass-card animate-in" style={{
                            width: '440px',
                            maxWidth: '90vw',
                            padding: '32px',
                            background: 'var(--bg-card)'
                        }}>
                            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>발행 안내</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
                                새로운 탭에서 네이버 블로그 게시글 창이 열립니다.
                            </p>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
                                새로운 창에서 마우스 클릭, 키보드 조작 할 경우 게시글이 제대로 작성되지 않을 수 있으니 주의하시기 바랍니다.
                            </p>
                            <p style={{ color: 'red', fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
                                (다른 탭에서의 조작은 무관합니다.)
                            </p>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{ padding: '8px 20px', minWidth: '80px' }}
                                    onClick={() => {
                                        setShowPublishNotice(false);
                                        publishNoticeResolveRef.current?.(false);
                                    }}
                                >
                                    취소
                                </button>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    style={{ padding: '8px 24px', minWidth: '100px' }}
                                    onClick={() => {
                                        setShowPublishNotice(false);
                                        publishNoticeResolveRef.current?.(true);
                                    }}
                                >
                                    확인
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Preset Delete Confirm Modal */}
                {presetPendingDeleteId !== null && createPortal(
                    <div style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 3000,
                        backdropFilter: 'blur(4px)'
                    }}>
                        <div className="glass-card animate-in" style={{
                            width: '420px',
                            maxWidth: '90vw',
                            padding: '32px',
                            background: 'var(--bg-card)'
                        }}>
                            <p style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
                                이 요청사항을 삭제하시겠습니까?
                            </p>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{ padding: '8px 20px', minWidth: '80px' }}
                                    onClick={() => setPresetPendingDeleteId(null)}
                                >
                                    취소
                                </button>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    style={{ padding: '8px 24px', minWidth: '100px' }}
                                    onClick={handleConfirmDeletePreset}
                                >
                                    확인
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Topic Selection Modal — rendered via portal to escape glass-card backdrop-filter stacking context */}
                {isTopicModalOpen && createPortal(
                    <div style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        backdropFilter: 'blur(4px)'
                    }}>
                        <div className="glass-card animate-in" style={{
                            width: '800px',
                            maxWidth: '95vw',
                            maxHeight: '90vh',
                            padding: '40px',
                            background: 'var(--bg-card)',
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>주제 설정</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 32 }}>
                                포스팅에 가장 적합한 주제를 선택해 주세요. (네이버 블로그 홈 노출 기준)
                            </p>

                            <div className="bm-grid bm-grid-4" style={{
                                gap: '24px',
                                overflowY: 'auto',
                                marginBottom: '32px',
                                paddingRight: '12px'
                            }}>
                                {TOPIC_GROUPS.map((group, gIdx) => (
                                    <div key={gIdx}>
                                        <h3 style={{
                                            fontSize: 12,
                                            color: 'var(--text-muted)',
                                            fontWeight: 700,
                                            marginBottom: '16px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                        }}>
                                            {group.name}
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {group.topics.map((topic, tIdx) => (
                                                <button
                                                    key={tIdx}
                                                    type="button"
                                                    onClick={() => setTempTopic(topic)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: tempTopic === topic ? 'var(--accent)' : 'var(--text-secondary)',
                                                        fontSize: '14px',
                                                        textAlign: 'left',
                                                        cursor: 'pointer',
                                                        padding: '4px 0',
                                                        transition: 'color 0.2s'
                                                    }}
                                                >
                                                    <div style={{
                                                        width: '18px',
                                                        height: '18px',
                                                        borderRadius: '50%',
                                                        border: '2px solid',
                                                        borderColor: tempTopic === topic ? 'var(--accent)' : 'var(--border)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        background: tempTopic === topic ? 'var(--accent-glow)' : 'transparent'
                                                    }}>
                                                        {tempTopic === topic && <Icons.Check />}
                                                    </div>
                                                    <span style={{ fontWeight: tempTopic === topic ? 600 : 400 }}>{topic}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingTop: '24px',
                                borderTop: '1px solid var(--border)'
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setTempTopic('0')}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: tempTopic === '0' ? 'var(--accent)' : 'var(--text-muted)',
                                        fontSize: '14px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        border: '2px solid',
                                        borderColor: tempTopic === '0' ? 'var(--accent)' : 'var(--border)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {tempTopic === '0' && <Icons.Check />}
                                    </div>
                                    주제 선택 안 함
                                </button>

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{ padding: '8px 20px', minWidth: '80px' }}
                                        onClick={() => setIsTopicModalOpen(false)}
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        style={{ padding: '8px 24px', minWidth: '100px' }}
                                        onClick={() => {
                                            setForm({
                                                ...form,
                                                publish_options: { ...form.publish_options, topic_id: tempTopic }
                                            });
                                            setIsTopicModalOpen(false);
                                        }}
                                    >
                                        확인
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Right Pane: Live Preview Area */}
                <div style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: 24,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: 'inset 0 0 40px rgba(0,0,0,0.2)'
                }}>
                    <div style={{
                        padding: '20px 32px',
                        borderBottom: '1px solid var(--border)',
                        background: 'rgba(255,255,255,0.02)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: previewData ? 'var(--success)' : 'var(--text-muted)' }}></div>
                                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    AI 실시간 미리보기
                                </span>
                            </div>
                            {previews.length > 0 && (
                                <div data-tour="post-preview-tabs" style={{ display: 'flex', gap: 4 }}>
                                    {previews.map((_, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => { setActivePreviewIdx(idx); setIsEditingPreview(false); }}
                                            style={{
                                                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                                border: '1px solid',
                                                borderColor: activePreviewIdx === idx ? 'var(--accent)' : 'var(--border)',
                                                background: activePreviewIdx === idx ? 'rgba(27,67,50,0.15)' : 'transparent',
                                                color: activePreviewIdx === idx ? 'var(--accent)' : 'var(--text-muted)',
                                                cursor: 'pointer', transition: 'all 0.15s'
                                            }}
                                        >
                                            미리보기 {idx + 1}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {previewData && !previewLoading && (
                                <button
                                    data-tour="post-edit-toggle"
                                    type="button"
                                    onClick={() => setIsEditingPreview(e => !e)}
                                    style={{
                                        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                        border: '1px solid',
                                        borderColor: isEditingPreview ? 'var(--success)' : 'var(--accent)',
                                        background: isEditingPreview ? 'rgba(34,197,94,0.15)' : 'rgba(27,67,50,0.15)',
                                        color: isEditingPreview ? 'var(--success)' : 'var(--accent)',
                                        cursor: 'pointer', transition: 'all 0.2s ease'
                                    }}>
                                    {isEditingPreview ? '✓ 편집 완료' : '✏ 원고 편집'}
                                </button>
                            )}
                            {previewLoading && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>
                                    <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></div>
                                    AI가 작성 중...
                                </div>
                            )}
                        </div>
                    </div>

                    {/* SEO Analyzer Panel */}
                    {(previewData || previewLoading) && (
                        <div data-tour="post-seo-panel" style={{
                            padding: '24px 32px',
                            background: 'rgba(27,67,50, 0.05)',
                            borderBottom: '1px solid rgba(27,67,50, 0.1)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16
                        }}>
                            {/* Row 1: 핵심 키워드 + 본문 빈도 */}
                            <div className="bm-grid bm-grid-stat" style={{ gap: 12 }}>
                                <div style={{ background: 'rgba(0,0,0,0.1)', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>핵심 키워드</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                                        {previewData?.seo_stats?.main_keyword || previewData?.data_asset?.target_keywords?.main || '분석 중...'}
                                    </div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.1)', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>본문 빈도</div>
                                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                                        {(() => {
                                            if (!previewData?.body || !previewData?.seo_stats?.main_keyword) return '0회';
                                            const kw = previewData.seo_stats.main_keyword;
                                            const count = (previewData.body.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
                                            const target = previewData?.seo_stats?.body_target || 7;
                                            return <span style={{ color: count >= target ? 'var(--success)' : 'var(--text-primary)' }}>{count}회</span>;
                                        })()}
                                    </div>
                                </div>
                            </div>

                            {/* Row 2: 서브 키워드 + 소제목 빈도 */}
                            <div className="bm-grid bm-grid-stat" style={{ gap: 12 }}>
                                <div style={{ background: 'rgba(0,0,0,0.1)', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>서브 키워드</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {(previewData?.seo_stats?.sub_keywords || previewData?.data_asset?.target_keywords?.sub || []).map((sk, idx) => {
                                            const bodyCount = previewData?.body ? (previewData.body.match(new RegExp(sk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length : 0;
                                            const headingCount = previewData?.body ? (previewData.body.match(/\[QUOTE_?VERTICAL\]([\s\S]*?)\[\/QUOTE_?VERTICAL\]/gi) || []).filter(tag =>
                                                new RegExp(sk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(tag)
                                            ).length : 0;
                                            return (
                                                <span key={idx} style={{
                                                    fontSize: 11, padding: '2px 8px', borderRadius: 100,
                                                    background: bodyCount > 0 ? 'rgba(27,67,50,0.2)' : 'rgba(255,255,255,0.05)',
                                                    border: '1px solid',
                                                    borderColor: bodyCount > 0 ? 'var(--accent)' : 'var(--border)',
                                                    color: bodyCount > 0 ? 'var(--text-primary)' : 'var(--text-muted)'
                                                }}>
                                                    {sk} (본문: {bodyCount} / 소제목: {headingCount})
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.1)', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>소제목 빈도</div>
                                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                                        {(() => {
                                            if (!previewData?.body || !previewData?.seo_stats?.main_keyword) return '0회';
                                            const kw = previewData.seo_stats.main_keyword;
                                            const kwRegex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                                            const headingCount = (previewData.body.match(/\[QUOTE_?VERTICAL\]([\s\S]*?)\[\/QUOTE_?VERTICAL\]/gi) || []).filter(tag =>
                                                kwRegex.test(tag)
                                            ).length;
                                            const target = previewData?.seo_stats?.heading_target || 2;
                                            return <span style={{ color: headingCount >= target ? 'var(--success)' : 'var(--text-primary)' }}>{headingCount}회</span>;
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
                        {!previewData && !previewLoading ? (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 20, opacity: 0.3 }}>🖋️</div>
                                <p style={{ fontSize: 16 }}>왼쪽 양식을 작성하고 <br /><strong>'원고 생성'</strong> 버튼을 클릭하세요.</p>
                            </div>
                        ) : (
                            <div className="animate-in">
                                {/* 글자 수 뱃지 + 소제목 인용구 설정 버튼 */}
                                {previewData?.body && (() => {
                                    const charCount = previewData.body
                                        .replace(/\[IMAGE_ANCHOR_\d+\]/g, '')
                                        .replace(/\[BUSINESS_MAP_BLOCK\]/g, '')
                                        .replace(/\[BUSINESS_CTA_BANNER\]/g, '')
                                        .replace(/\[\/?B\]/g, '')
                                        .replace(/\[\/?(QUOTE_VERTICAL|QUOTE_DEFAULT|QUOTE_POSTIT|QUOTE_BALLOON|QUOTE_LINE_QUOTATION|QUOTE_FRAME)\]/g, '')
                                        .trim().length;
                                    return (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                            <button
                                                data-tour="post-quote-style-btn"
                                                onClick={() => setQuoteModalOpen(true)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 7,
                                                    fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 20,
                                                    background: 'rgba(27,67,50,0.12)', border: '1px solid rgba(27,67,50,0.35)',
                                                    color: 'var(--accent)', cursor: 'pointer', transition: 'background 0.15s',
                                                }}
                                            >
                                                <span>▌</span> 소제목 인용구 설정
                                            </button>
                                            <span style={{
                                                fontSize: 12, fontWeight: 700,
                                                padding: '5px 14px', borderRadius: 20,
                                                background: 'rgba(255,255,255,0.06)',
                                                border: '1px solid rgba(255,255,255,0.12)',
                                                color: 'var(--text-muted)'
                                            }}>
                                                글자수 {charCount.toLocaleString()}자
                                            </span>
                                        </div>
                                    );
                                })()}
                                {/* Title Section */}
                                <div style={{ marginBottom: 40 }}>
                                    <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>
                                        포스팅 제목 {isEditingPreview && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>— 편집 중</span>}
                                    </label>
                                    {isEditingPreview ? (
                                        <input
                                            type="text"
                                            value={previewData?.title || ''}
                                            onChange={e => setPreviews(prev => { const next = [...prev]; if (next[activePreviewIdx]) next[activePreviewIdx] = { ...next[activePreviewIdx], title: e.target.value }; return next; })}
                                            style={{
                                                width: '100%', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)',
                                                lineHeight: 1.4, background: 'rgba(27,67,50,0.05)',
                                                padding: '20px 24px', borderRadius: 16,
                                                border: '2px solid var(--accent)',
                                                outline: 'none', boxSizing: 'border-box'
                                            }}
                                        />
                                    ) : (
                                        <div style={{
                                            fontSize: 24, fontWeight: 800, color: 'var(--text-primary)',
                                            lineHeight: 1.4, background: 'rgba(0,0,0,0.2)',
                                            padding: '24px', borderRadius: 16, border: '1px solid var(--border)'
                                        }}>
                                            {previewData?.title || (previewLoading ? '제목을 구상 중입니다...' : '')}
                                        </div>
                                    )}
                                </div>

                                {/* Main Body & Image Prompts Split */}
                                <div className="bm-grid bm-grid-preview" style={{ gap: 24 }}>
                                    {/* Content Scroll */}
                                    <div>
                                        <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>
                                            본문 원고 {isEditingPreview && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>— 편집 중</span>}
                                        </label>
                                        {isEditingPreview ? (
                                            <textarea
                                                value={previewData?.body || ''}
                                                onChange={e => setPreviews(prev => { const next = [...prev]; if (next[activePreviewIdx]) next[activePreviewIdx] = { ...next[activePreviewIdx], body: e.target.value }; return next; })}
                                                style={{
                                                    width: '100%', fontSize: 15, lineHeight: 1.8,
                                                    color: 'var(--text-secondary)',
                                                    background: 'rgba(27,67,50,0.05)',
                                                    padding: '24px', borderRadius: 16,
                                                    border: '2px solid var(--accent)',
                                                    outline: 'none', resize: 'vertical',
                                                    minHeight: 600, boxSizing: 'border-box',
                                                    fontFamily: 'inherit', whiteSpace: 'pre-wrap'
                                                }}
                                            />
                                        ) : (
                                            <div style={{
                                                fontSize: 16, lineHeight: 1.8, color: 'var(--text-secondary)',
                                                background: 'rgba(0,0,0,0.2)', padding: '24px', borderRadius: 16,
                                                border: '1px solid var(--border)', whiteSpace: 'pre-wrap',
                                                minHeight: 500
                                            }}>
                                                {previewData?.body
                                                    ? renderPreviewBody(previewData.body)
                                                    : (previewLoading ? '원고를 작성하는 중입니다. 잠시만 기다려주세요...' : '')}
                                            </div>
                                        )}
                                    </div>

                                    {/* Side Info */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                        <div>
                                            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, display: 'block', fontWeight: 600, textTransform: 'uppercase' }}>
                                                {imageSource === 'stock' ? `무료 이미지 선택 (${previewData?.image_prompts?.length || 0}장)` : `생성될 이미지 (${previewData?.image_prompts?.length || 0})`}
                                            </label>

                                            {/* 무료 이미지 모드: 슬롯 카드 UI */}
                                            {imageSource === 'stock' && (
                                                <div data-tour="post-pexels-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                    {pexelsLoading && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'rgba(27,67,50,0.05)', borderRadius: 12, border: '1px solid rgba(27,67,50,0.15)' }}>
                                                            <div style={{ width: 14, height: 14, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Pexels 이미지 검색 + 한글 번역 중...</span>
                                                        </div>
                                                    )}
                                                    {!pexelsLoading && pexelsCandidates && pexelsCandidates.map((slot) => {
                                                        const slotNum = slot.index + 1;
                                                        const chosen = selectedPexels[slot.index];
                                                        return (
                                                            <div key={slot.index} style={{
                                                                display: 'flex', alignItems: 'center', gap: 10,
                                                                padding: '10px 12px', borderRadius: 12,
                                                                border: chosen ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                                                                background: chosen ? 'rgba(27,67,50,0.05)' : 'rgba(0,0,0,0.1)',
                                                                cursor: slot.photos.length > 0 ? 'pointer' : 'default',
                                                                transition: 'border 0.15s, background 0.15s'
                                                            }}
                                                                onClick={() => slot.photos.length > 0 && openPexelsModal(slot.index)}>
                                                                {/* 번호 배지 */}
                                                                <div style={{
                                                                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                                                    background: chosen ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    fontSize: 11, fontWeight: 800,
                                                                    color: chosen ? '#fff' : 'var(--text-muted)'
                                                                }}>
                                                                    {slotNum}
                                                                </div>

                                                                {/* 선택된 이미지 or 플레이스홀더 */}
                                                                <div style={{
                                                                    width: 60, height: 38, borderRadius: 6, overflow: 'hidden',
                                                                    flexShrink: 0, background: 'rgba(255,255,255,0.05)',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    border: '1px solid rgba(255,255,255,0.08)'
                                                                }}>
                                                                    {chosen ? (
                                                                        <img src={chosen.thumbnail} alt=""
                                                                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                                                    ) : (
                                                                        <span style={{ fontSize: 16, opacity: 0.3 }}>🖼️</span>
                                                                    )}
                                                                </div>

                                                                {/* 설명 + 상태 */}
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: 12, fontWeight: 700, color: chosen ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 2 }}>
                                                                        {slot.korean_description || `${slotNum}번 이미지`}
                                                                        {slot.index === 0 && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(썸네일)</span>}
                                                                    </div>
                                                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {chosen ? `© ${chosen.photographer}` : (slot.photos.length === 0 ? '검색 결과 없음 — 자동 대체' : '클릭하여 사진 선택')}
                                                                    </div>
                                                                </div>

                                                                {/* 오른쪽 액션 */}
                                                                {slot.photos.length > 0 && (
                                                                    <div style={{
                                                                        fontSize: 10, fontWeight: 700, flexShrink: 0,
                                                                        padding: '4px 10px', borderRadius: 20,
                                                                        border: '1px solid',
                                                                        borderColor: chosen ? 'var(--accent)' : 'var(--border)',
                                                                        color: chosen ? 'var(--accent)' : 'var(--text-muted)',
                                                                        background: 'transparent'
                                                                    }}>
                                                                        {chosen ? '변경' : '선택'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    {!pexelsLoading && !pexelsCandidates && previewData && (
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px', background: 'rgba(0,0,0,0.1)', borderRadius: 10 }}>
                                                            원고 생성 후 Pexels 이미지가 자동으로 표시됩니다.
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* AI 이미지 모드: 기존 프롬프트 목록 */}
                                            {imageSource !== 'stock' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                {previewData?.image_prompts?.map((p, i) => (
                                                    <div key={i} style={{
                                                        fontSize: 12, padding: '12px', background: 'rgba(27,67,50,0.05)',
                                                        border: '1px solid rgba(27,67,50,0.1)', borderRadius: 12,
                                                        color: 'var(--text-secondary)', lineHeight: 1.4
                                                    }}>
                                                        <span style={{ color: 'var(--accent)', fontWeight: 800, marginRight: 6 }}>#{i + 1}</span>
                                                        {p}
                                                    </div>
                                                ))}
                                                {(!previewData?.image_prompts || previewData.image_prompts.length === 0) && !previewLoading && (
                                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>이미지 정보가 없습니다.</div>
                                                )}
                                            </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Top Notification Bar — 발행 진행 중에도 폼 사용 가능 */}
            {currentPostId && (isProcessing || isSuccess || isFailed) && (
                <div style={{
                    position: 'fixed', top: 0, left: 260, right: 0, zIndex: 200,
                    height: 64,
                    background: isSuccess
                        ? 'var(--notify-bg-success)'
                        : isFailed
                        ? 'var(--notify-bg-failed)'
                        : 'var(--notify-bg)',
                    borderBottom: `1px solid ${isSuccess ? 'var(--success)' : isFailed ? 'var(--error)' : 'var(--accent)'}`,
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '0 24px',
                    backdropFilter: 'blur(12px)',
                    boxShadow: isSuccess
                        ? '0 4px 24px var(--notify-shadow-success)'
                        : isFailed
                        ? '0 4px 24px var(--notify-shadow-failed)'
                        : '0 4px 24px var(--notify-shadow)',
                }}>
                    {/* 상태 아이콘 */}
                    {isProcessing && <div className="spinner" style={{ width: 20, height: 20, flexShrink: 0, borderWidth: 2 }} />}
                    {isSuccess && <span style={{ fontSize: 20 }}>✅</span>}
                    {isFailed && <span style={{ fontSize: 20 }}>❌</span>}

                    {/* 현재 단계 텍스트 */}
                    <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: isSuccess ? 'var(--success)' : isFailed ? 'var(--error)' : 'var(--text-primary)',
                        minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '0 1 auto'
                    }}>
                        {isProcessing ? currentStep || '발행 진행 중...' : isSuccess ? '발행 완료!' : '발행 실패'}
                    </span>

                    {/* 진행률 바 */}
                    {isProcessing && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 120, maxWidth: 260 }}>
                            <div style={{ flex: 1, height: 5, background: 'var(--notify-bar-track)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%', background: 'var(--accent)',
                                    width: `${progressPercentage}%`, transition: 'width 0.5s ease-out'
                                }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>{progressPercentage}%</span>
                        </div>
                    )}

                    {/* 남은 시간 */}
                    {isProcessing && timeRemaining && timeRemaining !== '계산 중...' && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>~{timeRemaining}</span>
                    )}

                    {/* 대기열 배지 */}
                    {postQueue.length > 0 && (
                        <div style={{
                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                            background: 'rgba(27,67,50,0.25)', border: '1px solid var(--accent)',
                            color: 'var(--accent)', flexShrink: 0
                        }}>
                            대기 {postQueue.length}개
                        </div>
                    )}

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexShrink: 0 }}>
                        {/* 발행 완료 — 글 보기 */}
                        {isSuccess && realtimePost?.naver_post_url && (
                            <a href={realtimePost.naver_post_url} target="_blank" rel="noopener noreferrer"
                                style={{
                                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                    background: 'var(--success)', color: '#fff',
                                    textDecoration: 'none', display: 'flex', alignItems: 'center'
                                }}>
                                발행된 글 보기
                            </a>
                        )}
                        {/* 재시도 */}
                        {isFailed && (
                            <button type="button" onClick={handleSubmit}
                                style={{
                                    padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                    background: 'var(--error)', color: '#fff', border: 'none', cursor: 'pointer'
                                }}>
                                재시도
                            </button>
                        )}
                        {/* 긴급 중단 */}
                        {isProcessing && (
                            <button type="button" onClick={handleStop} disabled={isCancelling}
                                style={{
                                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                    border: '1px solid var(--error)', color: 'var(--error)',
                                    background: 'transparent', cursor: 'pointer', opacity: isCancelling ? 0.6 : 1
                                }}>
                                {isCancelling ? '중단 중...' : '중단'}
                            </button>
                        )}
                        {/* 닫기 (완료/실패 또는 타임아웃) */}
                        {(!isProcessing || isProcessingTimedOut) && (
                            <button type="button"
                                onClick={() => { setCurrentPostId(null); setRealtimePost(null); setProgressLogs([]); setProcessingStartTime(null); }}
                                style={{
                                    width: 28, height: 28, borderRadius: 6, fontSize: 14, fontWeight: 700,
                                    border: '1px solid var(--border)', color: 'var(--text-muted)',
                                    background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                ✕
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Pexels 이미지 선택 모달 */}
            {pexelsModalOpen && pexelsModalSlot !== null && pexelsCandidates && createPortal(
                <div
                    onClick={handlePexelsModalCancel}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '20px'
                    }}>
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: '100%', maxWidth: 720,
                            background: 'var(--glass-bg, #1a1a2e)',
                            border: '1px solid var(--border)',
                            borderRadius: 20,
                            padding: '28px',
                            boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
                            display: 'flex', flexDirection: 'column', gap: 20
                        }}>
                        {/* 헤더 */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                    {pexelsModalSlot + 1}번 이미지{pexelsModalSlot === 0 ? ' (썸네일)' : ''}
                                </div>
                                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                                    {pexelsCandidates[pexelsModalSlot]?.korean_description || `${pexelsModalSlot + 1}번 이미지`}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                    {pexelsCandidates[pexelsModalSlot]?.query}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handlePexelsModalCancel}
                                style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)',
                                    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                ✕
                            </button>
                        </div>

                        {/* 후보 사진 3장 */}
                        <div className="bm-grid bm-grid-3" style={{ gap: 12 }}>
                            {(pexelsCandidates[pexelsModalSlot]?.photos || []).map((photo) => {
                                const isSelected = pexelsModalTemp?.id === photo.id;
                                return (
                                    <button
                                        key={photo.id}
                                        type="button"
                                        onClick={() => setPexelsModalTemp(isSelected ? null : photo)}
                                        style={{
                                            padding: 0, border: 'none', background: 'none', cursor: 'pointer',
                                            borderRadius: 12, overflow: 'hidden', position: 'relative',
                                            outline: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                                            outlineOffset: 2,
                                            boxShadow: isSelected ? '0 0 0 5px rgba(27,67,50,0.2)' : 'none',
                                            transition: 'outline 0.12s, box-shadow 0.12s'
                                        }}>
                                        <img
                                            src={photo.url}
                                            alt={photo.photographer}
                                            style={{ width: '100%', aspectRatio: pexelsModalSlot === 0 ? '1/1' : '16/9', objectFit: 'cover', display: 'block' }}
                                        />
                                        {isSelected && (
                                            <div style={{
                                                position: 'absolute', top: 8, right: 8,
                                                width: 26, height: 26, borderRadius: '50%',
                                                background: 'var(--accent)', border: '2px solid #fff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 13
                                            }}>✓</div>
                                        )}
                                        <div style={{
                                            position: 'absolute', bottom: 0, left: 0, right: 0,
                                            padding: '20px 10px 8px',
                                            background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
                                            fontSize: 10, color: 'rgba(255,255,255,0.8)',
                                            textAlign: 'left'
                                        }}>
                                            © {photo.photographer}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* 하단 버튼 */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                            <button
                                type="button"
                                onClick={handlePexelsModalCancel}
                                style={{
                                    padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                                    border: '1px solid var(--border)', color: 'var(--text-secondary)',
                                    background: 'transparent', cursor: 'pointer'
                                }}>
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handlePexelsModalSave}
                                disabled={!pexelsModalTemp}
                                style={{
                                    padding: '10px 26px', borderRadius: 10, fontSize: 13, fontWeight: 800,
                                    border: 'none',
                                    background: pexelsModalTemp ? 'var(--accent)' : 'rgba(27,67,50,0.3)',
                                    color: pexelsModalTemp ? '#fff' : 'rgba(255,255,255,0.4)',
                                    cursor: pexelsModalTemp ? 'pointer' : 'not-allowed',
                                    transition: 'background 0.15s, color 0.15s'
                                }}>
                                저장
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 소제목 인용구 설정 모달 */}
            {quoteModalOpen && previewData?.body && (
                <QuoteStyleModal
                    body={previewData.body}
                    onClose={() => setQuoteModalOpen(false)}
                    onApply={(newBody) => {
                        setPreviews(prev => {
                            const next = [...prev];
                            if (next[activePreviewIdx]) next[activePreviewIdx] = { ...next[activePreviewIdx], body: newBody };
                            return next;
                        });
                    }}
                />
            )}

            <SubscriptionGateModal open={showGateModal} onClose={() => setShowGateModal(false)} />
            <OnboardingTour pageKey="post" steps={postTourSteps} onEnd={handleOnboardingEnd} />

            <style jsx>{`
                .spinner {
                    width: 48px;
                    height: 48px;
                    border: 4px solid rgba(27,67,50, 0.1);
                    border-top: 4px solid var(--accent);
                    border-radius: 50%;
                    margin: 0 auto;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
            <SubscriptionGateModal open={showGateModal} onClose={() => setShowGateModal(false)} />
        </div>
    );
}

export default function NewPostPage() {
    return (
        <Suspense fallback={null}>
            <NewPostContent />
        </Suspense>
    );
}

