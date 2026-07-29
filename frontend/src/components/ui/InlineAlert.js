// settings/page.js에 4번 중복돼 있던 성공/실패 메시지 배너 블록 기준으로 통일.
const STYLES = {
    success: { color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.25)' },
    error:   { color: 'var(--error)',   bg: 'rgba(239, 68, 68, 0.1)',  border: 'rgba(239, 68, 68, 0.25)' },
    warning: { color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.25)' },
    info:    { color: 'var(--accent)',  bg: 'var(--accent-glow)',      border: 'var(--border-hover)' },
};

export default function InlineAlert({ type = 'info', children }) {
    if (!children) return null;
    const s = STYLES[type] || STYLES.info;
    return (
        <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: s.bg, border: `1px solid ${s.border}`,
            color: s.color, fontSize: 13, lineHeight: 1.5,
        }}>
            {children}
        </div>
    );
}
