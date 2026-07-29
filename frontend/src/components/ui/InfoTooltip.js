"use client";

import { useState } from 'react';

// RecommendationsWidget.js 쪽 구현(이미 테마 변수 사용, 다크/라이트 모두 정상)을 기준으로 통합.
// keywords/page.js 쪽 구현은 배경을 rgba(15,23,42,0.95)+흰 글자로 하드코딩해서 라이트 모드에서도
// 항상 어둡게 떠 있었던 버그가 있었음 — 여기서 그 버그를 없앤다.
//
// 두 가지 호출 방식을 모두 지원:
//   <InfoTooltip label="경쟁도" description="..." formulaLines={[...]} />  (자체 라벨+아이콘 트리거)
//   <InfoTooltip content="..."><Info size={14} /></InfoTooltip>            (트리거를 직접 넘김)
export default function InfoTooltip({ children, label, content, description, formulaLines, placement = 'bottom' }) {
    const [show, setShow] = useState(false);
    const body = content ?? description;

    const positionStyle = placement === 'top'
        ? { bottom: '100%', marginBottom: 10 }
        : { top: '100%', marginTop: 10 };

    return (
        <span
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'default' }}
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
        >
            {children ?? (
                <>
                    <span style={{ fontWeight: 600 }}>{label}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.7 }}>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="11.5" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                </>
            )}
            {show && (
                <div style={{
                    position: 'absolute', left: 0, zIndex: 50, ...positionStyle,
                    width: 'max-content', maxWidth: 300, padding: '10px 12px', borderRadius: 8,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-md)',
                    fontSize: 11, fontWeight: 400, lineHeight: 1.6, color: 'var(--text-secondary)',
                    whiteSpace: 'pre-line',
                }}>
                    <div>{body}</div>
                    {formulaLines && (
                        <div style={{ marginTop: 6 }}>
                            {formulaLines.map((line, i) => (
                                <div key={i} style={{ whiteSpace: 'nowrap' }}>{line}</div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </span>
    );
}
