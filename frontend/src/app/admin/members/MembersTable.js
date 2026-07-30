'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MemberDetailModal from './MemberDetailModal';

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const PLAN_LABELS = { free: 'FREE', basic: 'BASIC', pro: 'PRO', company: 'COMPANY' };

// 회원 목록 테이블 + 상세 모달을 함께 관리하는 클라이언트 컴포넌트.
// 모달은 행(tr)마다 만들지 않고 테이블 바깥에 하나만 두고 selectedId만 바꿔가며 재사용한다
// (모달이 <tbody> 안 <tr> 사이에 끼면 테이블 구조상 유효하지 않은 마크업이 되기 때문).
export default function MembersTable({ members }) {
    const [selectedId, setSelectedId] = useState(null);
    const router = useRouter();

    return (
        <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>이메일</th>
                        <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>가입일</th>
                        <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>요금제</th>
                        <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>네이버 계정 수</th>
                        <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>텔레그램 연동</th>
                        <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}></th>
                    </tr>
                </thead>
                <tbody>
                    {members.map(m => (
                        <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={{ padding: '16px 8px', fontSize: 14 }}>{m.email || '알 수 없음'}</td>
                            <td style={{ padding: '16px 8px', fontSize: 14 }}>{formatDate(m.created_at)}</td>
                            <td style={{ padding: '16px 8px', fontSize: 14 }}>
                                <span className="badge">{PLAN_LABELS[m.plan_type] || 'FREE'}</span>
                            </td>
                            <td style={{ padding: '16px 8px', fontSize: 14 }}>{m.naver_account_count}개</td>
                            <td style={{ padding: '16px 8px', fontSize: 14 }}>
                                {m.telegram_chat_id ? '✅ 연동됨' : '—'}
                            </td>
                            <td style={{ padding: '16px 8px', fontSize: 14, textAlign: 'right' }}>
                                <button
                                    onClick={() => setSelectedId(m.id)}
                                    className="btn-secondary"
                                    style={{ fontSize: 12, padding: '5px 12px' }}
                                >
                                    상세
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <MemberDetailModal
                open={!!selectedId}
                onClose={() => setSelectedId(null)}
                memberId={selectedId}
                onChanged={() => router.refresh()}
            />
        </>
    );
}
