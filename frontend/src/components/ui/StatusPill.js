// RecommendationsWidget.js의 competitionStyle/saturationStyle 필 렌더링 기준.
export default function StatusPill({ color, children }) {
    return (
        <span style={{
            fontSize: 11, fontWeight: 600, color,
            padding: '2px 7px', borderRadius: 99,
            background: `${color}18`,
            whiteSpace: 'nowrap',
        }}>
            {children}
        </span>
    );
}
