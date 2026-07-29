import { listMembers } from '@/lib/admin-telegram-actions';

export const dynamic = 'force-dynamic';

export default async function AdminMembersPage() {
    const members = await listMembers();

    const formatDate = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    };

    return (
        <div className="animate-in">
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>회원 관리</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32 }}>
                서비스에 가입한 전체 회원 목록입니다.
            </p>

            <div className="glass-card">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>이메일</th>
                            <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>가입일</th>
                            <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>요금제</th>
                            <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>네이버 계정 수</th>
                            <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>텔레그램 연동</th>
                        </tr>
                    </thead>
                    <tbody>
                        {members.map(m => (
                            <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                <td style={{ padding: '16px 8px', fontSize: 14 }}>{m.email || '알 수 없음'}</td>
                                <td style={{ padding: '16px 8px', fontSize: 14 }}>{formatDate(m.created_at)}</td>
                                <td style={{ padding: '16px 8px', fontSize: 14 }}>
                                    <span className="badge">{m.plan_type === 'pro' ? 'PRO' : 'FREE'}</span>
                                </td>
                                <td style={{ padding: '16px 8px', fontSize: 14 }}>{m.naver_account_count}개</td>
                                <td style={{ padding: '16px 8px', fontSize: 14 }}>
                                    {m.telegram_chat_id ? '✅ 연동됨' : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
