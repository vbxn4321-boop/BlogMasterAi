import StatusPill from './StatusPill';

// RecommendationsWidget.js 리스트 뷰 행 기준 — DemoRecommendationsWidget.js에 그대로
// 복붙돼 있던 것과 동일한 모양이라 하나로 통합. competition/saturation은
// { color, label } 형태로 호출 측에서 넘긴다(스타일 맵은 각 페이지가 소유).
export default function KeywordListRow({ rank, keyword, volume, competition, saturation, onAction, actionLabel = '포스팅 시작 →' }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: 10,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            gap: 12,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                {rank != null && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', minWidth: 22, textAlign: 'right' }}>
                        #{rank}
                    </span>
                )}
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {keyword}
                </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {volume != null && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        월 {typeof volume === 'number' ? volume.toLocaleString() : volume}
                    </span>
                )}
                {competition && <StatusPill color={competition.color}>{competition.label}</StatusPill>}
                {saturation && <StatusPill color={saturation.color}>{saturation.label}</StatusPill>}
                {onAction && (
                    <button
                        onClick={onAction}
                        style={{
                            fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 8,
                            border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                    >
                        {actionLabel}
                    </button>
                )}
            </div>
        </div>
    );
}
