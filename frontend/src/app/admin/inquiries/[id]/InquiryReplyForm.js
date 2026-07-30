'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { replyToInquiry } from '@/lib/admin-inquiry-actions';

export default function InquiryReplyForm({ inquiryId }) {
    const [replyText, setReplyText] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleSubmit = async () => {
        if (!replyText.trim()) return;
        setSaving(true);
        setError('');
        try {
            await replyToInquiry(inquiryId, replyText);
            router.push('/admin/inquiries');
        } catch (err) {
            setError(err.message);
        }
        setSaving(false);
    };

    return (
        <div style={{ marginTop: 16 }}>
            <textarea
                className="input-field"
                rows={5}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="답변 내용을 입력하세요..."
                style={{ width: '100%', resize: 'vertical' }}
            />
            {error && <div style={{ color: 'var(--error)', fontSize: 13, marginTop: 8 }}>{error}</div>}
            <div style={{ marginTop: 12 }}>
                <button
                    className="btn-primary"
                    onClick={handleSubmit}
                    disabled={saving || !replyText.trim()}
                    style={{ opacity: (saving || !replyText.trim()) ? 0.5 : 1 }}
                >
                    {saving ? '전송 중...' : '답변 보내기'}
                </button>
            </div>
        </div>
    );
}
