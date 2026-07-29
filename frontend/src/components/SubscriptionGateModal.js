"use client";

import { useRouter } from "next/navigation";
import { SUBSCRIPTION_MODAL_MESSAGE } from "@/lib/trial";
import { Modal } from "@/components/ui";

// 5개 탭에서 공통으로 재사용하는 구독 유도 모달. 공용 Modal 셸을 그대로 사용.
export default function SubscriptionGateModal({ open, onClose }) {
    const router = useRouter();

    return (
        <Modal open={open} onClose={onClose}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>구독 후 이용 가능한 기능이에요</h3>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
                    {SUBSCRIPTION_MODAL_MESSAGE}
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button type="button" className="btn-secondary" onClick={onClose}>확인</button>
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={() => { onClose(); router.push('/dashboard/settings'); }}
                    >
                        구독하러 가기
                    </button>
                </div>
            </div>
        </Modal>
    );
}
