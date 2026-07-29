// dashboard/page.js의 통계 카드(.glass-card.stat-card + .stat-label/.stat-value) 조합 기준.
// value 대신 children을 넘기면 등급 문자·미니 그리드 같은 복잡한 본문도 그대로 렌더링한다.
export default function StatCard({ icon, label, value, tip, children, style }) {
    return (
        <div className="glass-card stat-card" style={style}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
                <span className="stat-label">{label}</span>
                {tip}
            </div>
            {children ?? <span className="stat-value">{value}</span>}
        </div>
    );
}
