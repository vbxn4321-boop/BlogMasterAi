'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toKoreanErrorMessage } from '@/lib/errorMessage';

const UNREAD_POLL_MS = 60000;

function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 대시보드 어디서든 떠 있는 1:1 문의 위젯. dashboard/layout.js에 한 번만 렌더링된다.
// 실제 이메일 발송 없이 inquiries 테이블에 저장/조회하는 방식 — 관리자는 /admin/inquiries에서 확인.
export default function InquiryWidget() {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState('menu'); // 'menu' | 'new' | 'list'
    const [hasUnread, setHasUnread] = useState(false);
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const [sendDone, setSendDone] = useState(false);
    const [inquiries, setInquiries] = useState(null);
    const [listError, setListError] = useState('');

    const checkUnread = useCallback(async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { count } = await supabase
            .from('inquiries')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'answered')
            .is('user_read_at', null);
        setHasUnread((count || 0) > 0);
    }, []);

    useEffect(() => {
        checkUnread();
        const interval = setInterval(checkUnread, UNREAD_POLL_MS);
        return () => clearInterval(interval);
    }, [checkUnread]);

    const openWidget = () => {
        setOpen(true);
        setView('menu');
        setSendDone(false);
        setSendError('');
    };

    const closeWidget = () => {
        setOpen(false);
    };

    const handleSend = async () => {
        if (!message.trim()) return;
        setSending(true);
        setSendError('');
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');
            const { error } = await supabase.from('inquiries').insert({ user_id: user.id, message: message.trim() });
            if (error) throw new Error(toKoreanErrorMessage(error));
            setMessage('');
            setSendDone(true);
        } catch (err) {
            setSendError(err.message);
        }
        setSending(false);
    };

    const handleDeleteInquiry = async (id) => {
        if (!confirm('이 문의를 삭제하시겠습니까?')) return;
        try {
            const supabase = createClient();
            const { error } = await supabase.from('inquiries').delete().eq('id', id);
            if (error) throw new Error(toKoreanErrorMessage(error));
            setInquiries(prev => prev.filter(i => i.id !== id));
            checkUnread();
        } catch (err) {
            setListError(err.message);
        }
    };

    const openList = async () => {
        setView('list');
        setListError('');
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            const { data, error } = await supabase
                .from('inquiries')
                .select('id, message, status, admin_reply, replied_at, user_read_at, created_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            if (error) throw new Error(toKoreanErrorMessage(error));
            setInquiries(data || []);

            // 답변완료인데 아직 안 읽은 것들을 읽음 처리 (컬럼 단위 권한상 user_read_at만 수정 가능)
            const unreadIds = (data || []).filter(i => i.status === 'answered' && !i.user_read_at).map(i => i.id);
            if (unreadIds.length > 0) {
                await supabase.from('inquiries').update({ user_read_at: new Date().toISOString() }).in('id', unreadIds);
                setHasUnread(false);
            }
        } catch (err) {
            setListError(err.message);
        }
    };

    return (
        <>
            <button
                onClick={() => (open ? closeWidget() : openWidget())}
                aria-label="1:1 문의"
                style={{
                    position: 'fixed', right: 24, bottom: 24, zIndex: 200,
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'var(--accent)', color: '#fff', border: 'none',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.25)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22,
                }}
            >
                💬
                {hasUnread && (
                    <span style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 12, height: 12, borderRadius: '50%',
                        background: 'var(--error)', border: '2px solid var(--bg-primary, #fff)',
                    }} />
                )}
            </button>

            {open && (
                <div style={{
                    position: 'fixed', right: 24, bottom: 88, zIndex: 200,
                    width: 320, maxHeight: '70vh', overflowY: 'auto',
                    borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
                }} className="glass-card">
                    <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>
                            {view === 'menu' && '1:1 문의'}
                            {view === 'new' && '1:1 문의하기'}
                            {view === 'list' && '받은 메세지'}
                        </span>
                        <button onClick={closeWidget} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
                    </div>

                    <div style={{ padding: 18 }}>
                        {view === 'menu' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <button
                                    className="btn-primary"
                                    onClick={() => { setView('new'); setSendDone(false); }}
                                    style={{ width: '100%' }}
                                >
                                    1:1 문의하기
                                </button>
                                <button
                                    className="btn-secondary"
                                    onClick={openList}
                                    style={{ width: '100%', position: 'relative' }}
                                >
                                    받은 메세지
                                    {hasUnread && (
                                        <span style={{
                                            position: 'absolute', top: -4, right: -4,
                                            width: 9, height: 9, borderRadius: '50%', background: 'var(--error)',
                                        }} />
                                    )}
                                </button>
                            </div>
                        )}

                        {view === 'new' && (
                            sendDone ? (
                                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                    </div>
                                    <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>문의가 접수되었습니다.<br />답변이 오면 이 아이콘에 표시됩니다.</div>
                                </div>
                            ) : (
                                <>
                                    <textarea
                                        className="input-field"
                                        rows={5}
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder="문의하실 내용을 입력해주세요."
                                        style={{ width: '100%', resize: 'vertical' }}
                                    />
                                    {sendError && <div style={{ color: 'var(--error)', fontSize: 12, marginTop: 6 }}>{sendError}</div>}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                        <button
                                            className="btn-primary"
                                            onClick={handleSend}
                                            disabled={sending || !message.trim()}
                                            style={{ flex: 1, opacity: (sending || !message.trim()) ? 0.5 : 1 }}
                                        >
                                            {sending ? '보내는 중...' : '보내기'}
                                        </button>
                                        <button className="btn-secondary" onClick={closeWidget} style={{ flex: 1 }}>
                                            닫기
                                        </button>
                                    </div>
                                </>
                            )
                        )}

                        {view === 'list' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {listError && <div style={{ color: 'var(--error)', fontSize: 13 }}>{listError}</div>}
                                {!listError && inquiries === null && (
                                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>불러오는 중...</div>
                                )}
                                {inquiries?.length === 0 && (
                                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>보낸 문의가 없습니다.</div>
                                )}
                                {inquiries?.map(i => (
                                    <div key={i.id} style={{
                                        padding: 12, borderRadius: 10, background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border)', fontSize: 13,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatDateTime(i.created_at)}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {i.status === 'answered' ? (
                                                    <span className="badge" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', fontSize: 10 }}>답변완료</span>
                                                ) : (
                                                    <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', fontSize: 10 }}>답변 대기</span>
                                                )}
                                                <button
                                                    onClick={() => handleDeleteInquiry(i.id)}
                                                    title="삭제"
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: 'var(--text-muted)', fontSize: 12, padding: '2px 4px', lineHeight: 1,
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                        <div style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', marginBottom: i.admin_reply ? 8 : 0 }}>{i.message}</div>
                                        {i.admin_reply && (
                                            <div style={{
                                                marginTop: 6, padding: 10, borderRadius: 8,
                                                background: 'var(--accent-glow)', whiteSpace: 'pre-wrap',
                                            }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>관리자 답변</div>
                                                {i.admin_reply}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {view !== 'menu' && view !== 'new' && (
                            <button onClick={() => setView('menu')} style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
                                ← 메뉴로
                            </button>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
