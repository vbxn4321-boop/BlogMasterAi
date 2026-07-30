import { listInquiries } from '@/lib/admin-inquiry-actions';
import InquiryRow from './InquiryRow';

export const dynamic = 'force-dynamic';

export default async function AdminInquiriesPage() {
    const inquiries = await listInquiries();

    return (
        <div className="animate-in">
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>문의</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32 }}>
                회원들이 보낸 1:1 문의 목록입니다. 클릭하면 전체 내용을 보고 답변할 수 있습니다.
            </p>

            <div className="glass-card">
                {inquiries.length === 0 ? (
                    <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        아직 접수된 문의가 없습니다.
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>보낸 사람</th>
                                <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>보낸 시각</th>
                                <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>내용</th>
                                <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}>상태</th>
                                <th style={{ padding: '12px 8px', fontSize: 13, color: 'var(--text-secondary)' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {inquiries.map(i => (
                                <InquiryRow key={i.id} inquiry={i} />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
