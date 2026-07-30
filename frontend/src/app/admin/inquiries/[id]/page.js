import Link from 'next/link';
import { getInquiry } from '@/lib/admin-inquiry-actions';
import InquiryReplyForm from './InquiryReplyForm';
import DeleteInquiryButton from './DeleteInquiryButton';

export const dynamic = 'force-dynamic';

function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default async function AdminInquiryDetailPage({ params }) {
    const { id } = await params;
    const inquiry = await getInquiry(id);

    return (
        <div className="animate-in" style={{ maxWidth: 720 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link href="/admin/inquiries" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
                    ← 문의 목록으로
                </Link>
                <DeleteInquiryButton inquiryId={inquiry.id} />
            </div>

            <div className="glass-card" style={{ marginTop: 16, padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>{inquiry.user_email}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{formatDateTime(inquiry.created_at)}</div>
                    </div>
                    {inquiry.status === 'answered' ? (
                        <span className="badge" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)' }}>답변완료</span>
                    ) : (
                        <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)' }}>미답변</span>
                    )}
                </div>

                <div style={{
                    padding: 16, borderRadius: 10, background: 'var(--bg-secondary)',
                    fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                    {inquiry.message}
                </div>

                {inquiry.status === 'answered' && (
                    <div style={{ marginTop: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
                            내 답변 · {formatDateTime(inquiry.replied_at)}
                        </div>
                        <div style={{
                            padding: 16, borderRadius: 10, background: 'var(--accent-glow)',
                            fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                        }}>
                            {inquiry.admin_reply}
                        </div>
                    </div>
                )}

                {inquiry.status !== 'answered' && <InquiryReplyForm inquiryId={inquiry.id} />}
            </div>
        </div>
    );
}
