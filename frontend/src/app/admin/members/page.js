import { listMembers } from '@/lib/admin-telegram-actions';
import MembersTable from './MembersTable';

export const dynamic = 'force-dynamic';

export default async function AdminMembersPage() {
    const members = await listMembers();

    return (
        <div className="animate-in">
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>회원 관리</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32 }}>
                서비스에 가입한 전체 회원 목록입니다. &apos;상세&apos;를 누르면 결제 내역을 보고, 무료 회원을 컴퍼니 등급으로 전환할 수 있습니다.
            </p>

            <div className="glass-card">
                <MembersTable members={members} />
            </div>
        </div>
    );
}
