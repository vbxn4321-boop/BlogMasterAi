// ════════════════════════════════════════
// 예약 관리 클라이언트 컴포넌트 — 비활성화됨
// 아래 원본 코드는 주석 처리되어 있습니다.
// ════════════════════════════════════════

export default function ScheduleClient() {
    return null;
}

/*
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ScheduleClient({ initialPosts }) {
    const supabase = createClient();
    const [posts, setPosts] = useState(initialPosts || []);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Edit Modal State
    const [editingPost, setEditingPost] = useState(null);
    const [editForm, setEditForm] = useState(null);

    const handleCancel = async (postId) => {
        if (!confirm("이 예약을 삭제(취소)하시겠습니까?")) return;
        setLoading(true);
        const { error } = await supabase.from("posts").delete().eq("id", postId);
        if (error) setError(error.message);
        else setPosts(posts.filter(p => p.id !== postId));
        setLoading(false);
    };

    const handlePublishNow = async (postId) => {
        if (!confirm("지금 즉시 발행을 시작하시겠습니까?")) return;
        setLoading(true);
        const { error } = await supabase
            .from("posts")
            .update({ status: 'pending', scheduled_at: null })
            .eq("id", postId);

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        setPosts(posts.map(p => p.id === postId ? { ...p, status: 'pending', scheduled_at: null } : p));

        // 엔진 트리거 호출
        try {
            const res = await fetch('/api/post/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: postId }),
            });
            if (!res.ok) {
                const errData = await res.json();
                setError(errData.error || '엔진 트리거 실패');
            }
        } catch (triggerErr) {
            setError('엔진 연결 실패: ' + triggerErr.message);
        }

        setLoading(false);
    };

    const handleEditSchedule = async (postId, currentSchedule) => {
        let defaultTime = "";
        if (currentSchedule) {
            const date = new Date(currentSchedule);
            const tzOffset = date.getTimezoneOffset() * 60000;
            const localISOTime = (new Date(date - tzOffset)).toISOString().slice(0, 16);
            defaultTime = localISOTime;
        }

        const newDate = prompt("새로운 예약 시간을 입력하세요 (YYYY-MM-DDTHH:mm)", defaultTime);
        if (!newDate) return;

        // Force 10-minute increment
        const d = new Date(newDate);
        const mins = d.getMinutes();
        const roundedMins = Math.round(mins / 10) * 10;
        d.setMinutes(roundedMins);
        d.setSeconds(0);
        const finalISO = d.toISOString();

        setLoading(true);
        const { error } = await supabase
            .from("posts")
            .update({ status: 'scheduled', scheduled_at: finalISO })
            .eq("id", postId);

        if (error) {
            setError(error.message);
        } else {
            setPosts(posts.map(p => p.id === postId ? { ...p, status: 'scheduled', scheduled_at: finalISO } : p));
        }
        setLoading(false);
    };

    const openEditModal = (post) => {
        let baseTopic = post.topic || "";
        let kwConfig = { main_keyword: '', sub_keywords: '' };
        if (baseTopic.includes('|||')) {
            const parts = baseTopic.split('|||');
            baseTopic = parts[0];
            try { kwConfig = JSON.parse(parts[1]); } catch (e) { }
        }

        setEditForm({
            id: post.id,
            topic: baseTopic,
            main_keyword: kwConfig.main_keyword || '',
            sub_keywords: kwConfig.sub_keywords || '',
        });
        setEditingPost(post);
    };

    const closeEditModal = () => {
        setEditingPost(null);
        setEditForm(null);
    };

    const saveEditForm = async () => {
        setLoading(true);
        let finalTopic = editForm.topic;
        if (editForm.main_keyword || editForm.sub_keywords) {
            finalTopic += `|||${JSON.stringify({
                main_keyword: editForm.main_keyword,
                sub_keywords: editForm.sub_keywords,
            })}`;
        }

        const { error } = await supabase
            .from('posts')
            .update({ topic: finalTopic })
            .eq('id', editForm.id);

        if (error) {
            setError(error.message);
        } else {
            setPosts(posts.map(p => p.id === editForm.id ? { ...p, topic: finalTopic } : p));
            alert("수정되었습니다.");
            closeEditModal();
        }
        setLoading(false);
    };

    return (
        <div className="animate-in" style={{ position: 'relative' }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>예약 & 대기열 리스트</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32 }}>
                목록을 클릭하면 원고의 주제와 핵심/서브 키워드 등 상세 내용을 확인하고 수정할 수 있습니다.
            </p>

            {error && <div style={{ color: 'var(--error)', marginBottom: 16 }}>{error}</div>}

            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                {posts && posts.length > 0 ? (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>계정 및 기본주제</th>
                                <th>발행 예정일시</th>
                                <th>상태</th>
                                <th style={{ textAlign: 'right' }}>관리 동작</th>
                            </tr>
                        </thead>
                        <tbody>
                            {posts.map((post) => (
                                <tr key={post.id} style={{ opacity: loading ? 0.5 : 1, cursor: 'pointer' }} onClick={() => openEditModal(post)}>
                                    <td>
                                        <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}>
                                            {post.naver_accounts?.concept || '설정 계정'}
                                        </div>
                                        <div style={{ fontWeight: 500 }}>{post.topic?.split('|||')[0] || '(제목 없음)'}</div>
                                    </td>
                                    <td>
                                        {post.scheduled_at ? (
                                            <div>
                                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {new Date(post.scheduled_at).toLocaleDateString('ko-KR')}
                                                </span>
                                                <br />
                                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                    {new Date(post.scheduled_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>즉시 대기 중</span>
                                        )}
                                    </td>
                                    <td>
                                        <span className={`badge ${post.status === 'scheduled' ? 'badge-pending' : 'badge-warning'}`}>
                                            {post.status === 'scheduled' ? '예약 대기' : '처리 큐 진입'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap', maxWidth: '280px', marginLeft: 'auto' }}>
                                            {post.status === 'scheduled' && (
                                                <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}
                                                    onClick={() => handlePublishNow(post.id)}>
                                                    즉시 발행
                                                </button>
                                            )}
                                            <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}
                                                onClick={() => handleEditSchedule(post.id, post.scheduled_at)}>
                                                시간 변경
                                            </button>
                                            <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12, borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--error)' }}
                                                onClick={() => handleCancel(post.id)}>
                                                예약 삭제
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        현재 예약 대기 중인 포스팅이 없습니다.
                    </div>
                )}
            </div>

            {editingPost && editForm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(5px)'
                }} onClick={closeEditModal}>
                    <div className="glass-card" style={{ width: '450px', padding: '32px' }} onClick={(e) => e.stopPropagation()}>
                        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>포스팅 정보 수정</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>컨텐츠 주제</label>
                                <input type="text" className="input-field" value={editForm.topic} onChange={e => setEditForm({ ...editForm, topic: e.target.value })} />
                            </div>
                            <div>
                                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>핵심 키워드</label>
                                <input type="text" className="input-field" value={editForm.main_keyword} onChange={e => setEditForm({ ...editForm, main_keyword: e.target.value })} placeholder="예: 스위스 여행" />
                            </div>
                            <div>
                                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>서브 키워드 (,로 구분)</label>
                                <input type="text" className="input-field" value={editForm.sub_keywords} onChange={e => setEditForm({ ...editForm, sub_keywords: e.target.value })} placeholder="예: 인터라켄, 융프라우, 부모님" />
                            </div>

                            <div style={{ display: 'flex', gap: 12, marginTop: 12, justifyContent: 'flex-end' }}>
                                <button className="btn-secondary" onClick={closeEditModal}>닫기</button>
                                <button className="btn-primary" onClick={saveEditForm} disabled={loading}>{loading ? '저장 중...' : '변경 내용 저장'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
*/
