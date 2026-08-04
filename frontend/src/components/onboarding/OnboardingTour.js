'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const STORAGE_PREFIX = 'bm_onboarding_dismissed_';
// 자동 시작이든 수동 재시작이든 항상 이 이벤트를 통해서만 투어가 시작된다. 페이지 쪽에서
// (예: post/page.js) 투어 시작 시점에 조건부 UI를 위한 예시 데이터를 미리 채워 넣는 등의
// 반응을 하고 싶을 때 이 이벤트를 그대로 구독하면 된다.
export const ONBOARDING_START_EVENT = 'bm:start-onboarding';

// 사이드바 메뉴 등 어디서든 특정 페이지의 온보딩 투어를 강제로 다시 시작시키고 싶을 때 호출한다.
export function startOnboarding(pageKey) {
    window.dispatchEvent(new CustomEvent(ONBOARDING_START_EVENT, { detail: { pageKey } }));
}

// 스포트라이트(설명 대상만 밝게, 나머지는 반투명 회색) 방식의 페이지별 온보딩 투어.
// steps: [{ id, title, body }] — id는 화면의 data-tour="id" 요소와 매칭된다.
// 현재 화면에 없는 조건부 UI(토글로 열리는 패널 등)를 가리키는 스텝은 자동으로 건너뛴다.
export default function OnboardingTour({ pageKey, steps, onEnd }) {
    const [stepIndex, setStepIndex] = useState(0);
    const [active, setActive] = useState(false);
    const [rect, setRect] = useState(null);

    // 닫기/다시보지않기/완료 등 어떤 경로로 끝나든, active가 true→false로 바뀌는 순간에만
    // 한 번 onEnd를 호출한다 (각 종료 지점마다 개별적으로 호출하면 빠뜨리기 쉬움).
    const wasActiveRef = useRef(false);
    useEffect(() => {
        if (wasActiveRef.current && !active) onEnd?.();
        wasActiveRef.current = active;
    }, [active, onEnd]);

    // 처음 방문이고 "다시 보지 않기"를 누른 적이 없으면 자동 시작 — 이때도 startOnboarding을
    // 그대로 호출해서, 수동 재시작과 동일한 이벤트 경로를 타게 한다(페이지 쪽 리스너가
    // 자동 시작인지 수동 재시작인지 구분할 필요 없이 항상 반응할 수 있도록).
    // 처음 방문이고 "다시 보지 않기"를 누른 적이 없으면 자동 시작
    useEffect(() => {
        try {
            if (!localStorage.getItem(STORAGE_PREFIX + pageKey)) {
                const timer = setTimeout(() => {
                    startOnboarding(pageKey);
                }, 600);
                return () => clearTimeout(timer);
            }
        } catch (_) {}
    }, [pageKey]);

    // 사이드바의 "온보딩 다시보기" 등 외부 트리거
    useEffect(() => {
        const handler = (e) => {
            if (e.detail?.pageKey !== pageKey) return;
            setStepIndex(0);
            setActive(true);
        };
        window.addEventListener(ONBOARDING_START_EVENT, handler);
        return () => window.removeEventListener(ONBOARDING_START_EVENT, handler);
    }, [pageKey]);

    // 스텝이 바뀔 때 대상 요소를 탐색한다 (DOM 렌더링 지연 대비 200ms 간격 최대 10회 재시도)
    useEffect(() => {
        if (!active) return;
        const step = steps[stepIndex];
        if (!step) { setActive(false); return; }

        let attempts = 0;
        let timer = null;

        const findAndHighlight = () => {
            const el = document.querySelector(`[data-tour="${step.id}"]`);
            if (el) {
                setRect(null);
                el.scrollIntoView({ block: 'center', behavior: 'auto' });
                requestAnimationFrame(() => setRect(el.getBoundingClientRect()));
            } else if (attempts < 10) {
                attempts++;
                timer = setTimeout(findAndHighlight, 200);
            } else {
                // 10회 재시도 후에도 요소가 없으면 다음 스텝으로 진행
                if (stepIndex < steps.length - 1) setStepIndex(i => i + 1);
                else setActive(false);
            }
        };

        findAndHighlight();
        return () => { if (timer) clearTimeout(timer); };
    }, [active, stepIndex, steps]);

    // 사용자가 직접 스크롤하거나 창 크기를 바꾸면 위치만 다시 재측정한다 (스크롤을 다시
    // 트리거하지 않음 — 안 그러면 위 효과와 되먹임 루프가 생긴다).
    useEffect(() => {
        if (!active) return;
        const step = steps[stepIndex];
        if (!step) return;
        const onChange = () => {
            const el = document.querySelector(`[data-tour="${step.id}"]`);
            if (el) setRect(el.getBoundingClientRect());
        };
        window.addEventListener('resize', onChange);
        window.addEventListener('scroll', onChange, true);
        return () => {
            window.removeEventListener('resize', onChange);
            window.removeEventListener('scroll', onChange, true);
        };
    }, [active, stepIndex, steps]);

    const close = () => setActive(false);
    const dismissForever = () => {
        try { localStorage.setItem(STORAGE_PREFIX + pageKey, '1'); } catch (_) {}
        setActive(false);
    };
    const next = () => {
        if (stepIndex >= steps.length - 1) { close(); return; }
        setStepIndex(i => i + 1);
    };
    const prev = () => setStepIndex(i => Math.max(0, i - 1));

    if (!active || !rect || !steps[stepIndex]) return null;

    const step = steps[stepIndex];
    const PAD = 8;
    const spotTop = rect.top - PAD;
    const spotLeft = rect.left - PAD;
    const spotWidth = rect.width + PAD * 2;
    const spotHeight = rect.height + PAD * 2;

    const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const CARD_WIDTH = 320;
    const CARD_HEIGHT_EST = 220;
    const cardBelow = spotTop + spotHeight + CARD_HEIGHT_EST < viewportH;
    const cardTop = cardBelow ? spotTop + spotHeight + 14 : Math.max(12, spotTop - CARD_HEIGHT_EST);
    const cardLeft = Math.min(Math.max(spotLeft, 16), viewportW - CARD_WIDTH - 16);

    // 페이지 어딘가에 transform/backdrop-filter 등을 가진 조상이 있으면 position:fixed의
    // 기준점이 화면 전체가 아니라 그 조상으로 바뀌어버린다(.animate-in의 transform이 실제
    // 원인이었음) — 이를 피하기 위해 body에 직접 붙여서 항상 진짜 화면 기준으로 배치한다.
    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }}>
            {/* 상단 컨트롤 바 */}
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9002,
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
                padding: '14px 20px',
            }}>
                <button
                    type="button"
                    onClick={dismissForever}
                    style={{
                        fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(0,0,0,0.55)',
                        color: '#fff', cursor: 'pointer',
                    }}
                >
                    다시 보지 않기
                </button>
                <button
                    type="button"
                    onClick={close}
                    style={{
                        fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(0,0,0,0.55)',
                        color: '#fff', cursor: 'pointer',
                    }}
                >
                    닫기 ✕
                </button>
            </div>

            {/* 스포트라이트 컷아웃 (box-shadow로 나머지 전체를 반투명 회색 처리) */}
            <div
                style={{
                    position: 'fixed',
                    top: spotTop, left: spotLeft, width: spotWidth, height: spotHeight,
                    borderRadius: 12,
                    boxShadow: '0 0 0 9999px rgba(20,20,20,0.68)',
                    outline: '2px solid var(--accent)',
                    outlineOffset: 2,
                    transition: 'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease',
                    pointerEvents: 'none',
                    zIndex: 9000,
                }}
            />

            {/* 설명 카드 */}
            <div
                style={{
                    position: 'fixed', top: cardTop, left: cardLeft, width: CARD_WIDTH, zIndex: 9001,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: 14, padding: 20, boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                }}
            >
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>
                    {stepIndex + 1} / {steps.length}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
                    {step.title}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 18, whiteSpace: 'pre-line' }}>
                    {step.body}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        type="button"
                        onClick={prev}
                        disabled={stepIndex === 0}
                        style={{
                            fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8,
                            border: '1px solid var(--border)', background: 'transparent',
                            color: stepIndex === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                            cursor: stepIndex === 0 ? 'default' : 'pointer',
                        }}
                    >
                        이전
                    </button>
                    <button
                        type="button"
                        onClick={next}
                        style={{
                            fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 8,
                            border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                        }}
                    >
                        {stepIndex === steps.length - 1 ? '완료' : '다음'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
