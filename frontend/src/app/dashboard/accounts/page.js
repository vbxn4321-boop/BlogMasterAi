"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { DEMO_ACCOUNT, isDemoAccount } from "@/lib/trial";
import { displayNaverId } from "@/lib/naver";
import SubscriptionGateModal from "@/components/SubscriptionGateModal";
import { InlineAlert } from "@/components/ui";

// 예전엔 "미술·디자인"처럼 두 주제를 한 항목으로 묶었으나, 각각 독립적으로
// 선택·조회·추천되도록 전부 단일 항목으로 분리함 (원고 발행 시 네이버 실제
// "주제 설정" 팝업과 매칭되는 post/page.js의 TOPIC_GROUPS와는 무관 — 그건 건드리지 않음)
const NAVER_CATEGORIES = [
    {
        group: '엔터테인먼트·예술',
        items: ['문학', '책', '영화', '미술', '디자인', '공연', '전시', '음악', '드라마', '스타', '연예인', '만화', '애니', '방송'],
    },
    {
        group: '생활·노하우·쇼핑',
        items: ['일상', '생각', '육아', '결혼', '반려동물', '좋은글', '이미지', '패션', '미용', '인테리어', 'DIY', '요리', '레시피', '상품리뷰', '원예', '재배'],
    },
    {
        group: '취미·여가·여행',
        items: ['게임', '스포츠', '사진', '자동차', '취미', '국내여행', '세계여행', '맛집'],
    },
    {
        group: '지식·동향',
        items: ['IT', '컴퓨터', '사회', '정치', '건강', '의학', '비즈니스', '경제', '어학', '외국어', '교육', '학문'],
    },
];

function ConceptPicker({ value, onChange }) {
    return (
        <div className="bm-grid-4" style={{
            display: 'grid',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
            background: 'var(--bg-secondary)',
        }}>
            {NAVER_CATEGORIES.map((cat) => (
                <div key={cat.group} className="concept-picker-cell" style={{
                    padding: '16px 20px',
                }}>
                    <div style={{
                        fontSize: 12, fontWeight: 700, color: 'var(--text-primary)',
                        marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)',
                    }}>
                        {cat.group}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {cat.items.map(item => {
                            const selected = value === item;
                            return (
                                <div key={item} onClick={() => onChange(item)} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    cursor: 'pointer', fontSize: 13,
                                    color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                                    fontWeight: selected ? 700 : 400,
                                    userSelect: 'none',
                                }}>
                                    <span style={{
                                        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                                        boxSizing: 'border-box',
                                        border: selected ? '5px solid var(--accent)' : '1.5px solid var(--text-muted)',
                                        transition: 'border 0.15s',
                                    }} />
                                    {item}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function AccountsPage() {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ naver_id: '', password: '', concept: '맛집' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [editingFooter, setEditingFooter] = useState(null);
    const [editingConcept, setEditingConcept] = useState(null);
    const [editingConceptValue, setEditingConceptValue] = useState('');
    const [conceptSaving, setConceptSaving] = useState(false);
    const [conceptError, setConceptError] = useState('');
    const [showGateModal, setShowGateModal] = useState(false);

    const { isSubscribed } = useSubscription();
    const supabase = createClient();
    const openGateModal = () => setShowGateModal(true);

    // 화면에는 예시 계정(비구독자)을 함께 보여주되, 개수 표시/3개 제한 로직은
    // 실제 accounts 상태를 그대로 사용해 기존 동작을 바꾸지 않는다.
    const displayAccounts = isSubscribed ? accounts : [DEMO_ACCOUNT, ...accounts];

    useEffect(() => { loadAccounts(); }, []);

    const loadAccounts = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const { data } = await supabase
            .from('naver_accounts')
            .select('*')
            .eq('user_id', user?.id)
            .order('created_at');
        setAccounts(data || []);
        setLoading(false);
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');

        const { data: { user } } = await supabase.auth.getUser();
        const { error: insertError } = await supabase.from('naver_accounts').insert({
            user_id: user.id,
            naver_id: formData.naver_id.trim().split('@')[0],
            encrypted_password: formData.password,
            concept: formData.concept,
        });

        if (insertError) {
            setError(insertError.message.includes('Maximum') ? '최대 3개까지 연결할 수 있습니다.' : insertError.message);
        } else {
            setFormData({ naver_id: '', password: '', concept: '맛집' });
            setShowForm(false);
            loadAccounts();
        }
        setSaving(false);
    };

    const handleUpdateConcept = async (id) => {
        if (isDemoAccount(id)) {
            setEditingConcept(null);
            openGateModal();
            return;
        }
        setConceptSaving(true);
        setConceptError('');
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
            .from('naver_accounts')
            .update({ concept: editingConceptValue })
            .eq('id', id)
            .eq('user_id', user.id);
        setConceptSaving(false);
        if (error) {
            setConceptError('저장 실패: ' + error.message);
        } else {
            setAccounts(prev => prev.map(a => a.id === id ? { ...a, concept: editingConceptValue } : a));
            setEditingConcept(null);
            setConceptError('');
        }
    };

    const handleDelete = async (id) => {
        if (isDemoAccount(id)) return openGateModal();
        if (!confirm('이 네이버 계정을 삭제하시겠습니까?')) return;
        await supabase.from('naver_accounts').delete().eq('id', id);
        loadAccounts();
    };

    const hasFooter = (account) => {
        const comps = account.biz_footer_components;
        return Array.isArray(comps) && comps.length > 0;
    };

    return (
        <div className="animate-in" style={{ maxWidth: 780, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                <div>
                    <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>네이버 계정 관리</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                        최대 3개의 네이버 블로그 아이디를 연동할 수 있습니다. ({accounts.length}/3)
                    </p>
                </div>
                {accounts.length < 3 && (
                    <button className="btn-primary" onClick={() => isSubscribed ? setShowForm(!showForm) : openGateModal()}>
                        {showForm ? '취소' : '+ 계정 추가'}
                    </button>
                )}
            </div>

            {/* Add Form */}
            {showForm && (
                <div className="glass-card animate-in" style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>새 네이버 계정 연결</h3>
                    <form onSubmit={handleAdd}>
                        {/* ID + 비밀번호 + 버튼 */}
                        <div className="bm-grid bm-grid-form" style={{ gap: 16, alignItems: 'end', marginBottom: 20 }}>
                            <div>
                                <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>네이버 ID</label>
                                <input className="input-field" placeholder="naver_id" value={formData.naver_id}
                                    onChange={e => setFormData({ ...formData, naver_id: e.target.value })} required />
                            </div>
                            <div>
                                <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>비밀번호</label>
                                <input type="password" className="input-field" placeholder="••••••" value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })} required />
                            </div>
                            <button type="submit" className="btn-primary" disabled={saving}>
                                {saving ? '저장 중...' : '연결'}
                            </button>
                        </div>

                        {/* 컨셉 선택 */}
                        <div>
                            <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                블로그 컨셉
                                <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 13 }}>
                                    {formData.concept ? `— ${formData.concept}` : ''}
                                </span>
                            </label>
                            <ConceptPicker
                                value={formData.concept}
                                onChange={(v) => setFormData({ ...formData, concept: v })}
                            />
                        </div>

                        {error && <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12 }}>{error}</p>}
                    </form>
                </div>
            )}

            {/* Accounts List */}
            <div style={{ display: 'grid', gap: 16 }}>
                {loading ? (
                    <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                        로딩 중...
                    </div>
                ) : displayAccounts.length === 0 ? (
                    <div className="glass-card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                        연결된 네이버 계정이 없습니다.
                    </div>
                ) : displayAccounts.map(account => (
                    <div key={account.id}>
                        {/* Account Row */}
                        <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 12,
                                    background: 'var(--gradient-1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 20, fontWeight: 800, color: 'white',
                                }}>
                                    {displayNaverId(account.naver_id)[0]?.toUpperCase()}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 16 }}>{displayNaverId(account.naver_id)}</div>
                                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>{account.concept}</span>
                                        {editingConcept !== account.id ? (
                                            <button
                                                onClick={() => { setEditingConcept(account.id); setEditingConceptValue(account.concept); }}
                                                style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                컨셉 수정
                                            </button>
                                        ) : (
                                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'var(--accent-glow)', color: 'var(--accent)', fontWeight: 600 }}>
                                                선택 중
                                            </span>
                                        )}
                                        <span style={{ opacity: 0.3 }}>·</span>
                                        <span>{account.is_session_valid
                                            ? <span style={{ color: 'var(--success)' }}>세션 활성</span>
                                            : <span style={{ color: 'var(--warning)' }}>세션 없음</span>}
                                        </span>
                                        <span style={{ opacity: 0.3 }}>·</span>
                                        <span style={{ color: hasFooter(account) ? 'var(--accent)' : 'var(--text-muted)' }}>
                                            {hasFooter(account) ? '푸터 설정됨' : '푸터 없음'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    className="btn-secondary"
                                    onClick={() => setEditingFooter(editingFooter === account.id ? null : account.id)}
                                    style={{ fontSize: 13 }}
                                >
                                    {editingFooter === account.id ? '닫기' : '푸터 설정'}
                                </button>
                                <button className="btn-secondary" onClick={() => handleDelete(account.id)}
                                    style={{ color: 'var(--error)', borderColor: 'rgba(239,68,68,0.3)', fontSize: 13 }}>
                                    삭제
                                </button>
                            </div>
                        </div>

                        {/* Concept Panel */}
                        {editingConcept === account.id && (
                            <div className="glass-card animate-in" style={{ marginTop: 4, borderTop: '2px solid var(--accent)', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>블로그 컨셉 선택 — {displayNaverId(account.naver_id)}</h3>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                        선택됨: <strong style={{ color: 'var(--accent)' }}>{editingConceptValue}</strong>
                                    </span>
                                </div>
                                <ConceptPicker value={editingConceptValue} onChange={setEditingConceptValue} />
                                {conceptError && (
                                    <p style={{ color: 'var(--error)', fontSize: 13, marginTop: 12 }}>{conceptError}</p>
                                )}
                                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                                    <button className="btn-primary" onClick={() => handleUpdateConcept(account.id)} disabled={conceptSaving}>
                                        {conceptSaving ? '저장 중...' : '저장'}
                                    </button>
                                    <button className="btn-secondary" onClick={() => { setEditingConcept(null); setConceptError(''); }}>
                                        취소
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Footer Editor */}
                        {editingFooter === account.id && (
                            <FooterEditor
                                account={account}
                                supabase={supabase}
                                onSaved={loadAccounts}
                                isSubscribed={isSubscribed}
                                onGateBlocked={openGateModal}
                            />
                        )}
                    </div>
                ))}
            </div>

            <SubscriptionGateModal open={showGateModal} onClose={() => setShowGateModal(false)} />
        </div>
    );
}

const MAX_IMAGES = 5;

const ALIGN_OPTS = [
    { value: 'left',   label: '왼쪽',   icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg> },
    { value: 'center', label: '가운데', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg> },
    { value: 'right',  label: '오른쪽', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg> },
];

function FooterEditor({ account, supabase, onSaved, isSubscribed, onGateBlocked }) {
    const isDemo = !isSubscribed && isDemoAccount(account.id);
    const [components, setComponents] = useState(() =>
        (account.biz_footer_components || []).map((c, i) => ({
            ...c,
            _id: c.id || `init_${i}_${c.type}_${Date.now()}`,
            link_type: c.link_type || 'none',
            link_value: c.link_value || '',
        }))
    );
    const [mapSearch, setMapSearch] = useState(() => {
        const init = {};
        (account.biz_footer_components || []).forEach((c, i) => {
            if (c.type === 'MAP') {
                const _id = c.id || `init_${i}_MAP_${Date.now()}`;
                init[_id] = { query: c.address || '', results: [], isSearching: false, label: '' };
            }
        });
        return init;
    });
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const fileInputRef = useRef(null);

    const imageCount = components.filter(c => c.type === 'IMAGE').length;
    const hasMap = components.some(c => c.type === 'MAP');

    const moveComponent = (index, dir) => {
        setComponents(prev => {
            const arr = [...prev];
            const target = index + dir;
            if (target < 0 || target >= arr.length) return arr;
            [arr[index], arr[target]] = [arr[target], arr[index]];
            return arr;
        });
    };

    const removeComponent = (index) => {
        setComponents(prev => prev.filter((_, i) => i !== index));
    };

    const updateComponent = (index, changes) => {
        setComponents(prev => prev.map((c, i) => i === index ? { ...c, ...changes } : c));
    };

    const addTextComponent = () => {
        setComponents(prev => [...prev, { _id: `text_${Date.now()}`, type: 'TEXT', content: '', align: 'center' }]);
    };

    const addMapComponent = () => {
        if (hasMap) {
            setMessage({ type: 'error', text: '지도는 하나만 추가할 수 있습니다.' });
            setTimeout(() => setMessage({ type: '', text: '' }), 3000);
            return;
        }
        const _id = `map_${Date.now()}`;
        setComponents(prev => [...prev, { _id, type: 'MAP', address: '' }]);
        setMapSearch(prev => ({ ...prev, [_id]: { query: '', results: [], isSearching: false, label: '' } }));
    };

    const addQuoteComponent = () => {
        setComponents(prev => [...prev, { _id: `quote_${Date.now()}`, type: 'QUOTE', content: '', quote_style: 'quote_default' }]);
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (fileInputRef.current) fileInputRef.current.value = '';

        if (isDemo) return onGateBlocked();

        if (imageCount >= MAX_IMAGES) {
            setMessage({ type: 'error', text: `이미지는 최대 ${MAX_IMAGES}개까지 등록할 수 있습니다.` });
            return;
        }
        if (!file.type.startsWith('image/')) {
            setMessage({ type: 'error', text: '이미지 파일만 업로드할 수 있습니다.' });
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setMessage({ type: 'error', text: '5MB 이하의 이미지만 업로드할 수 있습니다.' });
            return;
        }

        setUploading(true);
        setMessage({ type: '', text: '' });

        const ext = file.name.split('.').pop();
        const storagePath = `footer/${account.id}_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('assets').upload(storagePath, file, { upsert: true });

        if (uploadError) {
            setMessage({ type: 'error', text: '이미지 업로드 실패: ' + uploadError.message });
            setUploading(false);
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(storagePath);
        setComponents(prev => [...prev, { _id: `img_${Date.now()}`, type: 'IMAGE', url: publicUrl, link_type: 'none', link_value: '' }]);
        setUploading(false);
    };

    const handleMapSearch = async (compId, query) => {
        if (!query?.trim()) return;
        setMapSearch(prev => ({ ...prev, [compId]: { ...prev[compId], isSearching: true, results: [] } }));
        try {
            const res = await fetch(`/api/naver/search-place?query=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setMapSearch(prev => ({ ...prev, [compId]: { ...prev[compId], isSearching: false, results: data } }));
        } catch {
            setMessage({ type: 'error', text: '장소 검색에 실패했습니다.' });
            setMapSearch(prev => ({ ...prev, [compId]: { ...prev[compId], isSearching: false } }));
        }
    };

    const buildComponents = () => {
        return components.map(c => {
            if (c.type === 'IMAGE') {
                if (!c.url) return null;
                const comp = { type: 'IMAGE', url: c.url, id: c.id || c.url.split('/').pop().replace(/\.[^.]+$/, '') };
                if (c.link_type && c.link_type !== 'none' && c.link_value?.trim()) {
                    comp.link_type = c.link_type;
                    comp.link_value = c.link_value.trim();
                }
                return comp;
            }
            if (c.type === 'TEXT') return c.content?.trim() ? { type: 'TEXT', content: c.content.trim(), align: c.align || 'center' } : null;
            if (c.type === 'MAP') return c.address?.trim() ? { type: 'MAP', address: c.address.trim() } : null;
            if (c.type === 'QUOTE') return c.content?.trim() ? { type: 'QUOTE', content: c.content.trim(), quote_style: c.quote_style || 'quote_default' } : null;
            return null;
        }).filter(Boolean);
    };

    const handleSave = async () => {
        if (isDemo) return onGateBlocked();
        setSaving(true);
        setMessage({ type: '', text: '' });
        const built = buildComponents();
        const mapComp = built.find(c => c.type === 'MAP');
        const { error } = await supabase.from('naver_accounts').update({
            biz_footer_components: built,
            biz_map_address: mapComp?.address || null,
        }).eq('id', account.id);

        if (error) {
            setMessage({ type: 'error', text: '저장 실패: ' + error.message });
        } else {
            setMessage({ type: 'success', text: '푸터 설정이 저장되었습니다.' });
            onSaved();
            setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        }
        setSaving(false);
    };

    const handleClear = async () => {
        if (isDemo) return onGateBlocked();
        if (!confirm('푸터 설정을 모두 삭제하시겠습니까?')) return;
        setSaving(true);
        await supabase.from('naver_accounts').update({ biz_footer_components: [], biz_map_address: null }).eq('id', account.id);
        setComponents([]);
        setMapSearch({});
        onSaved();
        setSaving(false);
    };

    const typeLabel = { IMAGE: '🖼 이미지', TEXT: '📝 텍스트', MAP: '📍 지도', QUOTE: '💬 인용구' };
    const typeColor = {
        IMAGE: { bg: 'rgba(99,102,241,0.2)', color: 'var(--accent)' },
        TEXT:  { bg: 'rgba(34,197,94,0.2)',  color: 'var(--success)' },
        MAP:   { bg: 'rgba(251,146,60,0.2)', color: '#fb923c' },
        QUOTE: { bg: 'rgba(236,72,153,0.2)', color: '#ec4899' },
    };

    return (
        <div className="glass-card animate-in" style={{ marginTop: 4, borderTop: '2px solid var(--accent)', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>푸터 설정 — {displayNaverId(account.naver_id)}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>포스팅 마지막에 자동으로 추가됩니다.</p>
            </div>

            {/* 컴포넌트 리스트 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                {components.length === 0 && (
                    <div style={{ padding: 24, textAlign: 'center', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13 }}>
                        아래 버튼으로 푸터 요소를 추가하세요
                    </div>
                )}
                {components.map((comp, idx) => (
                    <div key={comp._id} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                        {/* 헤더 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: typeColor[comp.type].bg, color: typeColor[comp.type].color }}>
                                {typeLabel[comp.type]}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{idx + 1} / {components.length}</span>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                <button type="button" onClick={() => moveComponent(idx, -1)} disabled={idx === 0} title="위로"
                                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: idx === 0 ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary)', cursor: idx === 0 ? 'default' : 'pointer', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>▲</button>
                                <button type="button" onClick={() => moveComponent(idx, 1)} disabled={idx === components.length - 1} title="아래로"
                                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: idx === components.length - 1 ? 'rgba(255,255,255,0.2)' : 'var(--text-secondary)', cursor: idx === components.length - 1 ? 'default' : 'pointer', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>▼</button>
                                <button type="button" onClick={() => removeComponent(idx)} title="삭제"
                                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, color: 'var(--error)', cursor: 'pointer', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 }}>×</button>
                            </div>
                        </div>

                        {/* 바디 */}
                        <div style={{ padding: 12 }}>
                            {/* 이미지 */}
                            {comp.type === 'IMAGE' && (
                                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                    <img src={comp.url} alt="푸터 이미지" style={{ width: 100, height: 70, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 }} />
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>이미지 링크</label>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <select className="input-field" value={comp.link_type || 'none'} onChange={e => updateComponent(idx, { link_type: e.target.value })} style={{ width: 80, fontSize: 12, padding: '5px 6px' }}>
                                                <option value="none">없음</option>
                                                <option value="url">URL</option>
                                                <option value="tel">전화</option>
                                            </select>
                                            {comp.link_type !== 'none' && (
                                                <input className="input-field" value={comp.link_value || ''} onChange={e => updateComponent(idx, { link_value: e.target.value })}
                                                    placeholder={comp.link_type === 'url' ? 'https://...' : '010-0000-0000'} style={{ flex: 1, fontSize: 12, padding: '5px 8px' }} />
                                            )}
                                        </div>
                                        {comp.link_type !== 'none' && comp.link_value?.trim() && (
                                            <p style={{ fontSize: 11, color: 'var(--accent)', margin: 0 }}>{comp.link_type === 'tel' ? '📞' : '🔗'} {comp.link_value.trim()}</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* 텍스트 */}
                            {comp.type === 'TEXT' && (
                                <div>
                                    <textarea className="input-field" placeholder={"예)\n📞 문의: 010-1234-5678\n카카오: @mystore"}
                                        value={comp.content || ''} onChange={e => updateComponent(idx, { content: e.target.value })}
                                        style={{ height: 100, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, marginBottom: 8 }} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>정렬</span>
                                        {ALIGN_OPTS.map(opt => (
                                            <button key={opt.value} type="button" onClick={() => updateComponent(idx, { align: opt.value })} title={opt.label}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', transition: 'all 0.15s ease',
                                                    borderColor: (comp.align || 'center') === opt.value ? 'var(--accent)' : 'var(--border)',
                                                    background: (comp.align || 'center') === opt.value ? 'rgba(99,102,241,0.15)' : 'transparent',
                                                    color: (comp.align || 'center') === opt.value ? 'var(--accent)' : 'var(--text-muted)' }}>
                                                {opt.icon}{opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 인용구 */}
                            {comp.type === 'QUOTE' && (
                                <div>
                                    <textarea className="input-field" placeholder="인용구 안에 들어갈 내용을 입력하세요"
                                        value={comp.content || ''} onChange={e => updateComponent(idx, { content: e.target.value })}
                                        style={{ height: 90, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, marginBottom: 10 }} />
                                    <div className="bm-grid bm-grid-3" style={{ gap: 6 }}>
                                        {[
                                            { value: 'quote_default', label: '따옴표', preview: (
                                                <div style={{ background: '#f8f8f8', borderRadius: 4, padding: '8px 8px 8px 6px', fontSize: 9, color: '#444', minHeight: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                                    <span style={{ fontSize: 16, color: '#888', lineHeight: 1, fontFamily: 'Georgia, serif', display: 'block' }}>"</span>
                                                    <span style={{ lineHeight: 1.4 }}>인용 내용</span>
                                                    <span style={{ fontSize: 16, color: '#888', lineHeight: 1, fontFamily: 'Georgia, serif', display: 'block', alignSelf: 'flex-end' }}>"</span>
                                                </div>
                                            )},
                                            { value: 'quote_vertical', label: '버티컬 라인', preview: (
                                                <div style={{ borderLeft: '3px solid #888', paddingLeft: 8, fontSize: 9, color: '#444', background: '#fafafa', minHeight: 36, display: 'flex', alignItems: 'center' }}>
                                                    인용 내용
                                                </div>
                                            )},
                                            { value: 'quote_balloon', label: '말풍선', preview: (
                                                <div style={{ position: 'relative', marginBottom: 6 }}>
                                                    <div style={{ background: '#f0f0f0', borderRadius: 8, padding: '6px 8px', fontSize: 9, color: '#444', minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        인용 내용
                                                    </div>
                                                    <div style={{ position: 'absolute', bottom: -6, left: 12, width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '7px solid #f0f0f0' }}></div>
                                                </div>
                                            )},
                                            { value: 'quote_line_quotation', label: '라인&따옴표', preview: (
                                                <div style={{ background: '#f8f8f8', borderRadius: 4, padding: '6px 8px', fontSize: 9, color: '#444', minHeight: 36, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                    <span style={{ fontSize: 13, color: '#999', fontFamily: 'Georgia, serif', lineHeight: 1 }}>"</span>
                                                    <span style={{ borderBottom: '1px solid #ccc', paddingBottom: 4, lineHeight: 1.4 }}>인용 내용</span>
                                                </div>
                                            )},
                                            { value: 'quote_postit', label: '포스트잇', preview: (
                                                <div style={{ background: '#fff9c4', border: '1px solid #f0e040', borderRadius: 2, padding: '6px 8px', fontSize: 9, color: '#555', minHeight: 36, display: 'flex', alignItems: 'center', boxShadow: '1px 1px 3px rgba(0,0,0,0.1)' }}>
                                                    인용 내용
                                                </div>
                                            )},
                                            { value: 'quote_frame', label: '프레임', preview: (
                                                <div style={{ border: '1px solid #bbb', borderRadius: 2, padding: '6px 8px', fontSize: 9, color: '#444', minHeight: 36, display: 'flex', alignItems: 'center', background: '#fff', outline: '3px solid #f0f0f0', outlineOffset: '-4px' }}>
                                                    인용 내용
                                                </div>
                                            )},
                                        ].map(opt => (
                                            <button key={opt.value} type="button" onClick={() => updateComponent(idx, { quote_style: opt.value })}
                                                style={{ background: 'none', cursor: 'pointer', padding: 5, borderRadius: 8, textAlign: 'left',
                                                    border: (comp.quote_style || 'quote_default') === opt.value ? '2px solid #ec4899' : '2px solid var(--border)',
                                                    boxShadow: (comp.quote_style || 'quote_default') === opt.value ? '0 0 0 2px rgba(236,72,153,0.2)' : 'none',
                                                    transition: 'border 0.15s' }}>
                                                {opt.preview}
                                                <div style={{ fontSize: 10, fontWeight: 600, color: (comp.quote_style || 'quote_default') === opt.value ? '#ec4899' : 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
                                                    {opt.label}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 지도 */}
                            {comp.type === 'MAP' && (() => {
                                const ms = mapSearch[comp._id] || { query: comp.address || '', results: [], isSearching: false, label: '' };
                                const setMs = changes => setMapSearch(prev => ({ ...prev, [comp._id]: { ...ms, ...changes } }));
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <input className="input-field" placeholder="장소명 또는 주소 검색" value={ms.query}
                                                onChange={e => setMs({ query: e.target.value })}
                                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleMapSearch(comp._id, ms.query))}
                                                style={{ flex: 1, fontSize: 13 }} />
                                            <button type="button" onClick={() => handleMapSearch(comp._id, ms.query)} disabled={ms.isSearching}
                                                style={{ width: 42, background: 'var(--accent)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                                                {ms.isSearching ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></div>
                                                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
                                            </button>
                                        </div>
                                        {comp.address && (
                                            <div style={{ padding: '8px 12px', background: 'rgba(99,102,241,0.1)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📍 {comp.address}</div>
                                                    {ms.label && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{ms.label}</div>}
                                                </div>
                                                <button type="button" onClick={() => { updateComponent(idx, { address: '' }); setMs({ query: '', results: [], label: '' }); }}
                                                    style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px', borderRadius: 4, flexShrink: 0 }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                                </button>
                                            </div>
                                        )}
                                        {ms.results.length > 0 && (
                                            <div style={{ maxHeight: 200, overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                                                {ms.results.map((item, i) => (
                                                    <div key={i} onClick={() => { updateComponent(idx, { address: item.title }); setMs({ query: item.title, results: [], label: item.roadAddress || item.address || '' }); }}
                                                        style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{item.title}</div>
                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.roadAddress || item.address}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {ms.query && !ms.isSearching && ms.results.length === 0 && !comp.address && (
                                            <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px dashed var(--border)', textAlign: 'center' }}>
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>검색 결과가 없습니다.</div>
                                                <button type="button" onClick={() => { updateComponent(idx, { address: ms.query }); setMs({ results: [] }); }}
                                                    style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                    입력한 내용을 상호명으로 바로 사용하기
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                ))}
            </div>

            {/* 추가 버튼 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {imageCount < MAX_IMAGES && (
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            border: '1px dashed rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.05)', color: 'var(--accent)', cursor: uploading ? 'default' : 'pointer' }}>
                        {uploading ? '업로드 중...' : `🖼 이미지 추가 (${imageCount}/${MAX_IMAGES})`}
                    </button>
                )}
                <button type="button" onClick={addTextComponent}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        border: '1px dashed rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.05)', color: 'var(--success)', cursor: 'pointer' }}>
                    📝 텍스트 추가
                </button>
                <button type="button" onClick={addQuoteComponent}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        border: '1px dashed rgba(236,72,153,0.4)', background: 'rgba(236,72,153,0.05)', color: '#ec4899', cursor: 'pointer' }}>
                    💬 인용구 추가
                </button>
                {!hasMap && (
                    <button type="button" onClick={addMapComponent}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            border: '1px dashed rgba(251,146,60,0.4)', background: 'rgba(251,146,60,0.05)', color: '#fb923c', cursor: 'pointer' }}>
                        📍 지도 추가
                    </button>
                )}
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

            {/* 포스팅 순서 */}
            {components.length > 0 && (
                <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', fontSize: 12, color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>포스팅 순서: </span>
                    {components.map((c, i) => {
                        if (c.type === 'IMAGE') return `이미지${c.link_type !== 'none' && c.link_value?.trim() ? (c.link_type === 'tel' ? ' 📞' : ' 🔗') : ''}`;
                        if (c.type === 'TEXT') return '텍스트';
                        if (c.type === 'MAP') return '지도';
                        if (c.type === 'QUOTE') return '인용구';
                        return null;
                    }).filter(Boolean).join(' → ')}
                </div>
            )}

            {message.text && (
                <div style={{ marginBottom: 14 }}>
                    <InlineAlert type={message.type}>{message.text}</InlineAlert>
                </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={handleSave} disabled={saving || uploading}>
                    {saving ? '저장 중...' : '저장'}
                </button>
                {components.length > 0 && (
                    <button className="btn-secondary" onClick={handleClear} disabled={saving}
                        style={{ color: 'var(--error)', borderColor: 'rgba(239,68,68,0.3)', fontSize: 13 }}>
                        전체 삭제
                    </button>
                )}
            </div>
        </div>
    );
}
