"use client";

// 공용 모달 셸 — 기존에 SubscriptionGateModal/키워드 비교 모달/post 워크스페이스 곳곳에서
// 조금씩 다른 값(오버레이 투명도 0.6~0.75, blur 4~12px)으로 흩어져 있던 오버레이+glass-card
// 레시피를 하나로 통일한 것. variant="inline"은 fixed 대신 absolute로 띄워 부모 카드
// 안에서만 오버레이할 때 사용(예: 특정 섹션 위에만 뜨는 비교 모달).
export default function Modal({
    open,
    onClose,
    children,
    width = 380,
    maxHeight = '90vh',
    closeOnOverlayClick = true,
    variant = 'fixed',
    zIndex = 1000,
}) {
    if (!open) return null;

    return (
        <div
            style={{
                position: variant === 'inline' ? 'absolute' : 'fixed',
                inset: 0,
                background: 'rgba(10, 15, 30, 0.6)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
                zIndex,
            }}
            onClick={closeOnOverlayClick ? onClose : undefined}
        >
            <div
                className="glass-card"
                style={{ width, maxWidth: '90vw', maxHeight, overflowY: 'auto', padding: 28, position: 'relative' }}
                onClick={e => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}
