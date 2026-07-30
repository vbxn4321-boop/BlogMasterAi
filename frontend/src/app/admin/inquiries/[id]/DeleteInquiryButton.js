'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteInquiry } from '@/lib/admin-inquiry-actions';

export default function DeleteInquiryButton({ inquiryId }) {
    const [deleting, setDeleting] = useState(false);
    const router = useRouter();

    const handleDelete = async () => {
        if (!confirm('이 문의를 삭제하시겠습니까? 답변 내용도 함께 삭제됩니다.')) return;
        setDeleting(true);
        try {
            await deleteInquiry(inquiryId);
            router.push('/admin/inquiries');
        } catch (err) {
            alert(err.message);
            setDeleting(false);
        }
    };

    return (
        <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                padding: '6px 14px', fontSize: 12, color: 'var(--error)', cursor: 'pointer',
                opacity: deleting ? 0.5 : 1,
            }}
        >
            {deleting ? '삭제 중...' : '문의 삭제'}
        </button>
    );
}
