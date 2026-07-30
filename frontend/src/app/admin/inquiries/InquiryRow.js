'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteInquiry } from '@/lib/admin-inquiry-actions';

function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function InquiryRow({ inquiry }) {
    const [deleting, setDeleting] = useState(false);
    const router = useRouter();

    const handleDelete = async (e) => {
        e.stopPropagation();
        if (!confirm('이 문의를 삭제하시겠습니까? 답변 내용도 함께 삭제됩니다.')) return;
        setDeleting(true);
        try {
            await deleteInquiry(inquiry.id);
            router.refresh();
        } catch (err) {
            alert(err.message);
            setDeleting(false);
        }
    };

    return (
        <tr
            onClick={() => router.push(`/admin/inquiries/${inquiry.id}`)}
            style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', opacity: deleting ? 0.5 : 1 }}
        >
            <td style={{ padding: '14px 8px', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {inquiry.user_email}
            </td>
            <td style={{ padding: '14px 8px', fontSize: 13, color: 'var(--text-muted)' }}>
                {formatDateTime(inquiry.created_at)}
            </td>
            <td style={{ padding: '14px 8px', fontSize: 13, color: 'var(--text-secondary)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {inquiry.message}
            </td>
            <td style={{ padding: '14px 8px' }}>
                {inquiry.status === 'answered' ? (
                    <span className="badge" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)' }}>답변완료</span>
                ) : (
                    <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)' }}>미답변</span>
                )}
            </td>
            <td style={{ padding: '14px 8px', textAlign: 'right' }}>
                <button
                    onClick={handleDelete}
                    disabled={deleting}
                    title="문의 삭제"
                    style={{
                        background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                        padding: '5px 10px', fontSize: 12, color: 'var(--error)', cursor: 'pointer',
                    }}
                >
                    삭제
                </button>
            </td>
        </tr>
    );
}
