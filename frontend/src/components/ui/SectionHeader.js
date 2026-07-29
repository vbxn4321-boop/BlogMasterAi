// settings/page.js에 3번 복붙돼 있던 "그라디언트 아이콘 박스 + 제목 + 부제" 패턴 기준.
export default function SectionHeader({ icon, gradient, title, subtitle }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: gradient || 'var(--gradient-1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                flexShrink: 0,
            }}>
                {icon}
            </div>
            <div>
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
                {subtitle && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</p>
                )}
            </div>
        </div>
    );
}
