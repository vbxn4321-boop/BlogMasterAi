import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function Modal({
    open,
    onClose,
    children,
    width = 380,
    maxHeight = '90vh',
    closeOnOverlayClick = true,
    variant = 'fixed',
    zIndex = 9999,
}) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!open) return null;

    const modalContent = (
        <div
            style={{
                position: variant === 'inline' ? 'absolute' : 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.45)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
                zIndex,
            }}
            onClick={closeOnOverlayClick ? onClose : undefined}
        >
            <div
                style={{
                    width,
                    maxWidth: '92vw',
                    maxHeight,
                    overflowY: 'auto',
                    padding: 32,
                    position: 'relative',
                    background: 'var(--bg-card, #ffffff)',
                    border: '1px solid var(--border)',
                    borderRadius: 20,
                    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );

    if (variant === 'inline' || !mounted) {
        return modalContent;
    }

    return createPortal(modalContent, document.body);
}
