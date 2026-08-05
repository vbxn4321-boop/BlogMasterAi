"use client";

import { useState, useRef, useEffect } from "react";
import SectionHeader from "@/components/ui/SectionHeader";
import { createClient } from "@/lib/supabase/client";

const XHS_STATUS_LABELS = {
    pending_extension: "크롬 확장 프로그램이 페이지를 여는 중...",
    processing: "확장 프로그램이 영상/이미지를 스크래핑하는 중...",
    scraped: "업로드 완료 — 장면 분할/번역 분석 대기 중...",
    analyzing: "장면 분할 · 대본 번역 · 상품 인식 분석 중...",
    ready: "분석 완료",
    failed: "실패",
};

const TABS = [
    { key: "manual", label: "소재 직접 업로드" },
    { key: "topic", label: "주제 기반 자동 생성" },
    { key: "scraping", label: "샤오홍슈/쿠팡 파싱" },
    { key: "channel", label: "채널 관리 & 발행 현황" },
];

const ACCEPTED_TYPES = "video/mp4,image/png,image/jpeg";

function ManualUploadTab() {
    const [file, setFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [productName, setProductName] = useState("");
    const [emphasisText, setEmphasisText] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState(null);
    const objectUrlRef = useRef(null);

    useEffect(() => {
        return () => {
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        };
    }, []);

    const handleFileChange = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(f);
        objectUrlRef.current = url;
        setFile(f);
        setPreviewUrl(url);
        setResult(null);
        setError("");
    };

    const handleSubmit = async () => {
        if (!file || !productName.trim() || !emphasisText.trim()) {
            setError("미디어 파일, 상품명, 강조 멘트를 모두 입력해주세요.");
            return;
        }
        setLoading(true);
        setError("");
        setResult(null);
        try {
            const formData = new FormData();
            formData.set("media", file);
            formData.set("product_name", productName.trim());
            formData.set("emphasis_text", emphasisText.trim());

            const res = await fetch("/api/shorts/manual", { method: "POST", body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "쇼츠 생성에 실패했습니다.");
            setResult(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>1. 소재와 상품 정보 입력</h3>

                <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    미디어 파일 (MP4 / PNG / JPG)
                </label>
                <input
                    type="file"
                    accept={ACCEPTED_TYPES}
                    onChange={handleFileChange}
                    className="input-field"
                    style={{ marginBottom: 16, padding: "10px 12px" }}
                />

                {previewUrl && (
                    <div style={{ marginBottom: 16, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", maxWidth: 220 }}>
                        {file?.type?.startsWith("video/") ? (
                            <video src={previewUrl} controls style={{ width: "100%", display: "block" }} />
                        ) : (
                            <img src={previewUrl} alt="미리보기" style={{ width: "100%", display: "block" }} />
                        )}
                    </div>
                )}

                <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    상품명
                </label>
                <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="예: 여름 쿨매트 대형 사이즈"
                    className="input-field"
                    style={{ marginBottom: 16 }}
                />

                <label style={{ fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                    기본 강조 멘트
                </label>
                <textarea
                    value={emphasisText}
                    onChange={(e) => setEmphasisText(e.target.value)}
                    placeholder="예: 시원함 3배, 세탁 후에도 변형 없음, 여름 한정 할인가"
                    className="input-field"
                    style={{ minHeight: 90, marginBottom: 20, resize: "vertical" }}
                />

                {error && (
                    <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>
                )}

                <button onClick={handleSubmit} disabled={loading} className="btn-primary" style={{ width: "100%" }}>
                    {loading ? "쇼츠 생성 중... (최대 1분)" : "쇼츠 생성하기"}
                </button>
            </div>

            <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>2. 생성 결과</h3>

                {!result && !loading && (
                    <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                        좌측에서 소재와 상품 정보를 입력하고 생성 버튼을 누르면 완성된 9:16 쇼츠가 여기에 표시됩니다.
                    </p>
                )}

                {loading && (
                    <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                        Gemini 대본 작성 → edge-tts 음성 합성 → FFmpeg 렌더링 순서로 진행 중입니다...
                    </p>
                )}

                {result && (
                    <div>
                        <video
                            src={result.video_url}
                            controls
                            style={{ width: "100%", maxWidth: 260, aspectRatio: "9/16", borderRadius: 12, border: "1px solid var(--border)", display: "block", marginBottom: 16 }}
                        />
                        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>
                            길이: 약 {result.duration_sec}초
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "pre-wrap", background: "var(--bg-secondary)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                            {result.script}
                        </div>
                        <a href={result.video_url} download className="btn-secondary" style={{ display: "inline-block", textDecoration: "none", textAlign: "center" }}>
                            .mp4 다운로드
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}

function XhsParsingTab() {
    const [url, setUrl] = useState("");
    const [job, setJob] = useState(null);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const pollRef = useRef(null);

    useEffect(() => {
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    const pollJob = (jobId) => {
        const supabase = createClient();
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            const { data } = await supabase.from("xhs_scrape_jobs").select("*").eq("id", jobId).single();
            if (data) {
                setJob(data);
                if (data.status === "ready" || data.status === "failed") {
                    clearInterval(pollRef.current);
                }
            }
        }, 3000);
    };

    const handleSubmit = async () => {
        if (!url.trim()) {
            setError("샤오홍슈 게시물 URL을 입력해주세요.");
            return;
        }
        setSubmitting(true);
        setError("");
        setJob(null);
        try {
            const res = await fetch("/api/xhs/jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source_url: url.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "작업 생성에 실패했습니다.");
            setJob({ id: data.job_id, status: "pending_extension", source_url: url.trim() });
            pollJob(data.job_id);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ display: "grid", gap: 24 }}>
            <div className="glass-card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>샤오홍슈 게시물 URL 입력</h3>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                    URL을 입력하면 연결된 크롬 확장 프로그램이 자동으로 페이지를 열어 영상/이미지와 캡션을 가져옵니다.
                    확장 프로그램이 크롬에 설치되어 있고 대시보드와 연결되어 있어야 합니다.
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://www.xiaohongshu.com/explore/..."
                        className="input-field"
                    />
                    <button onClick={handleSubmit} disabled={submitting} className="btn-primary" style={{ whiteSpace: "nowrap" }}>
                        가져오기
                    </button>
                </div>
                {error && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>{error}</div>}
            </div>

            {job && (
                <div className="glass-card" style={{ padding: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                        <span
                            className={`badge ${job.status === "ready" ? "badge-pending" : ""}`}
                            style={{ background: job.status === "failed" ? "rgba(239,68,68,0.15)" : undefined, color: job.status === "failed" ? "#ef4444" : undefined }}
                        >
                            {XHS_STATUS_LABELS[job.status] || job.status}
                        </span>
                    </div>

                    {job.status === "failed" && (
                        <div style={{ color: "#ef4444", fontSize: 13 }}>{job.error_message || "처리 중 오류가 발생했습니다."}</div>
                    )}

                    {job.status === "ready" && (
                        <div style={{ display: "grid", gap: 20 }}>
                            {job.scenes?.length > 0 && (
                                <div>
                                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>분할된 장면 ({job.scenes.length}개)</h4>
                                    <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
                                        {job.scenes.map((s) => (
                                            <div key={s.index} style={{ flexShrink: 0, width: 110 }}>
                                                <img src={s.thumbnail_path} alt={`장면 ${s.index}`} style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)" }} />
                                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, textAlign: "center" }}>
                                                    {s.start}s ~ {s.end}s
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>번역/재구성된 한국어 대본</h4>
                                <div style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "pre-wrap", background: "var(--bg-secondary)", borderRadius: 10, padding: 14 }}>
                                    {job.translated_script}
                                </div>
                            </div>

                            <div>
                                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                                    추정 상품: <span style={{ color: "var(--accent)" }}>{job.product_name_guess}</span>
                                </h4>
                                {job.coupang_matches?.length > 0 ? (
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                                        {job.coupang_matches.map((p) => (
                                            <a key={p.productId} href={p.productUrl} target="_blank" rel="noreferrer"
                                                style={{ textDecoration: "none", color: "inherit", border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "block" }}>
                                                <img src={p.productImage} alt={p.productName} style={{ width: "100%", borderRadius: 6, marginBottom: 6 }} />
                                                <div style={{ fontSize: 12, lineHeight: 1.4 }}>{p.productName}</div>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginTop: 4 }}>{p.productPrice?.toLocaleString()}원</div>
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                        쿠팡 후보 상품을 찾지 못했습니다 (쿠팡 API 키 미설정 또는 검색 결과 없음).
                                    </p>
                                )}
                            </div>

                            <button className="btn-secondary" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
                                편집하기 (Phase B — 준비중)
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ComingSoonCard({ title, desc, bullets }) {
    return (
        <div className="glass-card" style={{ padding: 28 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>{desc}</p>
            <ul style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, paddingLeft: 18 }}>
                {bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
            <div style={{ marginTop: 20, fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
                🚧 준비중입니다
            </div>
        </div>
    );
}

export default function ShoppingShortsPage() {
    const [activeTab, setActiveTab] = useState("manual");

    return (
        <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
            <SectionHeader
                icon="🎬"
                title="유튜브 쇼핑 쇼츠"
                subtitle="영상 1건당 2~3원, 무료 오픈소스 파이프라인(FFmpeg · edge-tts · Gemini)으로 쇼핑 쇼츠를 자동 생성합니다."
            />

            <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        className={`badge ${activeTab === t.key ? "badge-pending" : ""}`}
                        style={{
                            border: "none", cursor: "pointer",
                            background: activeTab === t.key ? "rgba(99, 102, 241, 0.2)" : "none",
                            color: activeTab === t.key ? "var(--accent)" : "var(--text-secondary)",
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {activeTab === "manual" && <ManualUploadTab />}

            {activeTab === "topic" && (
                <ComingSoonCard
                    title="주제 기반 자동 생성"
                    desc="주제 키워드와 쿠팡 파트너스 상품 링크만 입력하면 Gemini가 대본과 이미지 검색 키워드를 뽑아 Pexels/Pixabay에서 소재를 자동으로 매칭합니다."
                    bullets={[
                        "Gemini로 숏폼 원고 및 이미지 검색 키워드 5개 추출",
                        "Pexels / Pixabay 무료 API에서 고화질 미디어 자동 파싱",
                        "매칭 미디어 + 자막 + TTS + BGM 합성 후 최종 쇼츠 생성",
                    ]}
                />
            )}

            {activeTab === "scraping" && <XhsParsingTab />}

            {activeTab === "channel" && (
                <ComingSoonCard
                    title="채널 관리 & 발행 현황"
                    desc="생성된 쇼츠를 미리보고 유튜브 예약 발행과 쿠팡 파트너스 고정 댓글까지 관리합니다."
                    bullets={[
                        "생성 완료된 쇼츠 목록 및 대본/자막 수정",
                        "유튜브 채널 OAuth 연동 및 예약 발행 설정",
                        "첫 번째 고정 댓글에 쿠팡 파트너스 단축 URL 자동 등록",
                    ]}
                />
            )}
        </div>
    );
}
