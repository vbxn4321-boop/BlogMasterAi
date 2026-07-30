"use client";

import { useState, useEffect, useMemo } from "react";
import {
    Search, Monitor, Smartphone, Plus, FileText,
    Layout, Users, TrendingUp, Info, Activity,
    Calendar, AlertCircle, CheckCircle2, Layers,
    ChevronUp, ChevronDown
} from "lucide-react";
import {
    ResponsiveContainer, LineChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    PieChart, Pie, Cell
} from "recharts";
import SubscriptionGateModal from "@/components/SubscriptionGateModal";
import { Modal, StatCard, InfoTooltip } from "@/components/ui";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import { keywordsTourSteps } from "@/lib/onboardingSteps";
import { toKoreanErrorMessage } from "@/lib/errorMessage";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#6366f1"];

const highlightKeyword = (text, keyword) => {
    if (!keyword || !text) return text;
    const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase()
            ? <strong key={i} style={{ color: 'var(--accent)' }}>{part}</strong>
            : part
    );
};

const PERIOD_PRESETS = [
    { label: '7일', days: 7 },
    { label: '30일', days: 30 },
    { label: '1년', days: 365 },
];

// 로컬 InfoTooltip 구현은 배경을 rgba(15,23,42,0.95)+흰 글자로 하드코딩해서
// 라이트 모드에서도 항상 어둡게 떠 있던 버그가 있었음 — 공용(테마 대응) InfoTooltip으로 교체.
const MetricCard = ({ title, icon: Icon, children, tip }) => (
    <StatCard
        style={{ height: '100%', padding: '24px' }}
        label={title}
        tip={tip && (
            <InfoTooltip content={tip} placement="top">
                <Info size={14} style={{ cursor: 'help', marginLeft: '6px', verticalAlign: 'middle' }} />
            </InfoTooltip>
        )}
    >
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            {children}
        </div>
    </StatCard>
);

const StatItem = ({ label, value, icon: Icon }) => (
    <div className="stat-card" style={{ textAlign: 'center', padding: 0, background: 'none', border: 'none' }}>
        <div className="stat-label" style={{ marginBottom: '4px' }}>{label}</div>
        <div className="stat-value" style={{ fontSize: '24px' }}>{value}</div>
    </div>
);

const getGradeColor = (grade) => {
    if (!grade) return "#94a3b8";
    const g = grade.toUpperCase();
    if (g.startsWith("S+")) return "#f59e0b";
    if (g.startsWith("S")) return "#fbbf24";
    if (g.startsWith("S-")) return "#fef3c7";
    if (g.startsWith("A+")) return "#059669";
    if (g.startsWith("A")) return "#10b981";
    if (g.startsWith("A-")) return "#6ee7b7";
    if (g.startsWith("B+")) return "#2563eb";
    if (g.startsWith("B")) return "#3b82f6";
    if (g.startsWith("B-")) return "#93c5fd";
    if (g.startsWith("C+")) return "#ea580c";
    if (g.startsWith("C")) return "#f97316";
    if (g.startsWith("C-")) return "#fdba74";
    if (g.startsWith("D+")) return "#dc2626";
    if (g.startsWith("D")) return "#ef4444";
    return "#fca5a5";
};

// 분석 단계 정의
const ANALYSIS_STEPS = [
    { id: 1, label: '키워드 데이터 수집',     desc: '네이버 광고 API에서 연관 키워드 풀을 가져오는 중...',  duration: 4000 },
    { id: 2, label: '검색량 & 발행량 조회',   desc: '네이버 검색 API로 월간 검색량과 발행 수를 확인 중...',  duration: 6000 },
    { id: 3, label: '인구통계 분석',           desc: '성별·연령별 검색 비중을 데이터랩에서 수집 중...',        duration: 8000 },
    { id: 4, label: '트렌드 & 섹션 분석',     desc: '30일 트렌드, PC/모바일 섹션 순서를 분석 중...',        duration: 6000 },
    { id: 5, label: '연관 키워드 스코어링',   desc: '100개 키워드의 경쟁도와 점수를 계산하는 중...',         duration: 18000 },
    { id: 6, label: 'AI 전략 인사이트 도출',  desc: 'Gemini AI가 황금키워드 전략을 생성하는 중...',          duration: 8000 },
];

export default function KeywordAnalysisPage() {
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [showGateModal, setShowGateModal] = useState(false);
    const [activeTab, setActiveTab] = useState("전체");
    const [visibleCount, setVisibleCount] = useState(10);
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });
    const [progressStep, setProgressStep] = useState(0); // 현재 진행 단계 (1-based)
    const [progressPercent, setProgressPercent] = useState(0);
    
    // Trend Chart States
    const [displayCriteria, setDisplayCriteria] = useState('블로그');
    const [contentType, setContentType] = useState('cumulative'); // 'cumulative' or 'monthly'
    const [selectedTag, setSelectedTag] = useState(0);

    // Reset selected tag when display criteria changes
    useEffect(() => {
        setSelectedTag(0);
    }, [displayCriteria]);
    const [trendKeywords, setTrendKeywords] = useState([]);
    const [tempKeywords, setTempKeywords] = useState([]);
    const [trendData, setTrendData] = useState([]);
    const [trendLoading, setTrendLoading] = useState(false);
    const [showCompareModal, setShowCompareModal] = useState(false);
    const [trendOptions, setTrendOptions] = useState({
        timeUnit: 'date',
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        ages: [],
        gender: null
    });

    // Update trend keywords when main keyword is analyzed
    useEffect(() => {
        if (result && result.seed_analysis) {
            setTrendKeywords([result.seed_analysis.keyword]);
            setTrendData(result.advanced_trend || []);
        }
    }, [result]);

    const fetchTrendData = async (keywords, options) => {
        setTrendLoading(true);
        try {
            const res = await fetch("/api/keywords/trend", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keywords, options })
            });
            if (res.ok) {
                const data = await res.json();
                setTrendData(data.trend || []);
            }
        } catch (e) {
            console.error("Trend Fetch Error:", e);
        } finally {
            setTrendLoading(false);
        }
    };

    const handleTrendOptionChange = (newOptions) => {
        const updated = { ...trendOptions, ...newOptions };
        setTrendOptions(updated);
        fetchTrendData(trendKeywords, updated);
    };

    const handleCompareApply = () => {
        const filtered = tempKeywords.filter(k => k.trim() !== "");
        setTrendKeywords(filtered);
        fetchTrendData(filtered, trendOptions);
        setShowCompareModal(false);
    };

    const sectionDescriptions = useMemo(() => ({
        pc: "네이버 PC 통합검색 결과 페이지를 실시간 스크래핑하여 섹션 DOM 순서를 추출합니다. 블로그 섹션이 상위에 있을수록 상위 노출에 유리합니다.",
        mobile: "네이버 모바일 통합검색 결과 페이지를 실시간 스크래핑하여 섹션 DOM 순서를 추출합니다. 블로그 섹션이 상위에 있을수록 상위 노출에 유리합니다.",
        grade: "네이버 광고 API 검색량(30pt) + DataLab 트렌드(20pt) + 검색량 크기(20pt) + 발행량(15pt) + 섹션 배치 순서(10pt) + 월별 안정성(5pt)을 합산한 100점 만점 점수를 등급으로 변환합니다.",
        searchVolume: "네이버 검색광고 API(키워드 도구)에서 가져온 최근 30일 PC + 모바일 평균 검색 횟수입니다. 실제 검색량과 ±10% 오차가 있을 수 있습니다.",
        documentCount: "네이버 검색 API(blog/cafearticle)로 조회한 누적 게시물 수입니다. 월간 발행량은 최근 1개월 필터를 적용한 스크래핑 값이며, 스크래핑 실패 시 누적량 ÷ 150으로 추정합니다.",
        saturation: "발행량 ÷ 검색량 × 100으로 산출합니다. 값이 낮을수록 경쟁이 적고 상위 노출에 유리한 키워드입니다.",
        projection: "네이버 DataLab 최근 60일 일별 데이터로 이번달 누적 검색량을 계산하고, 남은 일수는 최근 7일 일평균으로 예측해 월말 예상량을 산출합니다.",
        trend12: "네이버 DataLab 검색트렌드 API의 월별 상대값(0~100)을 네이버 광고 API 검색량 기준으로 실제 검색량으로 환산한 수치입니다.",
        popularTopics: "Gemini AI가 키워드 분석 데이터(검색량·발행량·트렌드·인구통계)를 기반으로 생성한 추천 주제입니다. AI 생성 콘텐츠로 참고용입니다.",
        relatedKeywords: "네이버 광고 API에서 수집한 연관 키워드 최대 100개를 검색량·발행량·트렌드로 스코어링한 결과입니다. 네이버 자동완성 API에서 가져온 키워드는 '연관' 태그로 표시됩니다.",
        colSearchVolume: "네이버 검색광고 API 기준 최근 30일 PC + 모바일 합산 검색량입니다.",
        colDocCount: "네이버 검색 API로 조회한 블로그 전체 누적 게시물 수입니다.",
        colSimilarity: "시드 키워드와의 문자열 포함 여부(높음) 및 편집 거리(Levenshtein Distance)로 산출한 철자 유사도입니다.",
        smartBlocks: "네이버 PC 통합검색 및 블로그·카페 탭을 실시간 스크래핑하여 수집한 게시물 목록입니다. 방문자 수는 각 블로그 홈에서 별도 수집합니다.",
        advancedTrend: "네이버 DataLab 검색트렌드 API의 상대값을 실제 검색량으로 환산한 추이입니다. 최대 5개 키워드를 동시에 비교할 수 있습니다.",
        age: "네이버 DataLab API를 연령대별로 필터링한 최근 1년 데이터를 기반으로 산출한 추정치입니다. 정확한 절대값이 아닌 어느 연령대가 주로 검색하는지 경향성 파악 용도입니다.",
        gender: "네이버 DataLab API를 성별로 필터링한 최근 1년 데이터를 기반으로 산출한 추정치입니다.",
        monthly: "최근 12개월 DataLab 월별 데이터를 기반으로 산출한 월별 검색 비율입니다. 월별 검색 비율을 통해 키워드의 시즈널리티를 확인할 수 있습니다.",
        weekly: "최근 12개월의 일별 DataLab 데이터를 요일별로 집계하여 산출한 요일별 검색 비율입니다."
    }), []);

    const handleSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const displayData = useMemo(() => {
        if (!result?.analysis_pool) return [];

        const filtered = [...result.analysis_pool].filter(item => {
            if (activeTab === "전체") return true;
            if (activeTab === "추천") return (item.raw_score || 0) > 60;
            if (activeTab === "급상승") return (item.trend_change || 0) > 5;
            if (activeTab === "정보성") return (item.search_volume || 0) > 500;

            // Cluster Filter
            const cluster = result?.clusters?.find(c => c.name === activeTab);
            if (cluster) return cluster.keywords?.includes(item.keyword);

            return true;
        });

        // 컬럼 정렬이 없으면 백엔드 순서(연관검색어 우선) 유지
        if (!sortConfig.key) return filtered.slice(0, visibleCount);

        return filtered.sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];

            if (sortConfig.key === 'similarity') {
                const weights = { '높음': 3, '보통': 2, '낮음': 1 };
                valA = weights[valA] || 0;
                valB = weights[valB] || 0;
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        }).slice(0, visibleCount);
    }, [result, activeTab, sortConfig, visibleCount]);

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return <div style={{ width: '16px' }} />;
        return sortConfig.direction === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />;
    };

    const handleAnalyze = async (e) => {
        if (e) e.preventDefault();
        if (!keyword.trim()) return;

        setLoading(true);
        setError("");
        setResult(null);
        setProgressStep(1);
        setProgressPercent(0);

        // 단계별 타임라인 자동 진행
        let currentStep = 1;
        let elapsed = 0;
        const totalDuration = ANALYSIS_STEPS.reduce((sum, s) => sum + s.duration, 0);
        const timers = [];

        ANALYSIS_STEPS.forEach((step, idx) => {
            const t = setTimeout(() => {
                setProgressStep(step.id);
                setProgressPercent(Math.round((elapsed / totalDuration) * 100));
            }, elapsed);
            timers.push(t);
            elapsed += step.duration;
        });

        // 마지막 단계 완료 직전 퍼센트 95%로 고정 (API 응답 대기)
        const lastT = setTimeout(() => setProgressPercent(95), elapsed - 500);
        timers.push(lastT);

        try {
            const res = await fetch("/api/keywords/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keyword: keyword.trim() })
            });

            if (!res.ok) {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const errorData = await res.json();
                    if (errorData.code === 'TRIAL_LIMIT_REACHED') {
                        setShowGateModal(true);
                        return;
                    }
                    throw new Error(errorData.error || "분석에 실패했습니다.");
                } else {
                    const text = await res.text();
                    throw new Error(`분석 중 서버 오류가 발생했습니다. (Status: ${res.status})`);
                }
            }

            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("서버에서 올바른 데이터를 받지 못했습니다. 잠시 후 다시 시도해 주세요.");
            }

            const data = await res.json();

            // 완료 애니메이션
            setProgressStep(ANALYSIS_STEPS.length);
            setProgressPercent(100);
            await new Promise(r => setTimeout(r, 400));

            setResult(data);
            setActiveTab("전체"); // 전체 탭 기본 (연관검색어 우선 정렬로 표시)
            setVisibleCount(10);
        } catch (err) {
            console.error("Analysis Error:", err);
            setError(toKoreanErrorMessage(err, '분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'));
        } finally {
            timers.forEach(clearTimeout);
            setLoading(false);
            setProgressStep(0);
            setProgressPercent(0);
        }
    };

    const topStatsSection = useMemo(() => {
        if (!result) return null;
        return (
            <div className="bm-grid bm-grid-5" style={{ gap: '16px', marginBottom: '24px' }}>
                <div data-tour="kw-grade-card">
                <MetricCard title="키워드 등급" tip={sectionDescriptions.grade}>
                    <div style={{ textAlign: 'center' }}>
                        <div className="stat-value" style={{ fontSize: '48px', color: getGradeColor(result.seed_analysis.grade), lineHeight: 1, marginBottom: '8px', background: 'none', WebkitTextFillColor: 'initial' }}>
                            {result.seed_analysis?.grade?.split('(')[0] || 'D'}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-secondary)' }}>{result.seed_analysis?.grade || '분석 중'}</div>
                    </div>
                </MetricCard>
                </div>
                <div data-tour="kw-volume-card">
                <MetricCard title="월간 검색량" tip={sectionDescriptions.searchVolume}>
                    <div style={{ textAlign: 'center' }}>
                        <div className="stat-value">{result.seed_analysis.search_volume.toLocaleString()}</div>
                        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '12px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}><Monitor size={12} style={{ marginBottom: '-2px' }} /> PC {result.seed_analysis.pc_volume?.toLocaleString() || '0'}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}><Smartphone size={12} style={{ marginBottom: '-2px' }} /> Mobile {result.seed_analysis.mobile_volume?.toLocaleString() || '0'}</div>
                        </div>
                    </div>
                </MetricCard>
                </div>
                <div data-tour="kw-publish-card">
                <MetricCard title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{contentType === 'cumulative' ? "누적 발행량" : "월간 발행량"}</span>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setContentType(contentType === 'cumulative' ? 'monthly' : 'cumulative'); }} style={{ fontSize: '10px', padding: '1px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.08)', color: 'var(--accent)', cursor: 'pointer' }}>
                            {contentType === 'cumulative' ? '월간' : '누적'}
                        </button>
                    </div>
                } tip={sectionDescriptions.documentCount}>
                    <div style={{ textAlign: 'center', width: '100%' }}>
                        <div className="stat-value">{contentType === 'cumulative' ? result.seed_analysis.document_count.toLocaleString() : (result.seed_analysis.monthly_document_count || 0).toLocaleString()}</div>
                        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '12px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>블로그 {contentType === 'cumulative' ? result.seed_analysis.blog_count?.toLocaleString() : (result.seed_analysis.monthly_blog_count || 0).toLocaleString()}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>카페 {contentType === 'cumulative' ? result.seed_analysis.cafe_count?.toLocaleString() : (result.seed_analysis.monthly_cafe_count || 0).toLocaleString()}</div>
                        </div>
                    </div>
                </MetricCard>
                </div>
                <div data-tour="kw-saturation-card">
                <MetricCard title={contentType === 'cumulative' ? "누적 포화 지수" : "월간 포화 지수"} tip={sectionDescriptions.saturation}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '100%', gap: '8px' }}>
                        {['blog', 'cafe', 'total'].map(key => {
                            const details = contentType === 'cumulative' ? result.seed_analysis.saturation_details : (result.seed_analysis.monthly_saturation_details || result.seed_analysis.saturation_details);
                            const data = details?.[key] || { text: 'N/A' };
                            return (
                                <div key={key} style={{ textAlign: 'center' }}>
                                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', border: '1px solid var(--border)' }}><Layers size={20} color="var(--accent)" /></div>
                                    <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>{data.text}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{{ blog: '블로그', cafe: '카페', total: '전체' }[key]}</div>
                                </div>
                            );
                        })}
                    </div>
                </MetricCard>
                </div>
                <div data-tour="kw-forecast-card">
                <MetricCard title="예상 검색량" tip={sectionDescriptions.projection}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2px' }}>
                                <div className="stat-value" style={{ fontSize: '24px' }}>{((result.seed_analysis.projected_month_total || result.seed_analysis.predicted_volume) / 10000).toFixed(2)}<span style={{ fontSize: '14px' }}>만</span></div>
                                <div style={{ fontSize: '12px', color: (result.seed_analysis.projected_month_trend ?? result.seed_analysis.trend_change) >= 0 ? 'var(--success)' : 'var(--error)', fontWeight: '700' }}>{(result.seed_analysis.projected_month_trend ?? result.seed_analysis.trend_change) >= 0 ? '▲' : '▼'} {Math.abs(result.seed_analysis.projected_month_trend ?? result.seed_analysis.trend_change ?? 0).toFixed(2)}%</div>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>월말 예상</div>
                        </div>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2px' }}>
                                <div className="stat-value" style={{ fontSize: '24px', background: 'none', WebkitTextFillColor: 'var(--text-secondary)' }}>{((result.seed_analysis.current_month_cumulative || result.seed_analysis.search_volume) / 10000).toFixed(2)}<span style={{ fontSize: '14px' }}>만</span></div>
                                <div style={{ fontSize: '12px', color: (result.seed_analysis.current_cumulative_trend ?? result.seed_analysis.trend_change) >= 0 ? 'var(--success)' : 'var(--error)', fontWeight: '700' }}>{(result.seed_analysis.current_cumulative_trend ?? result.seed_analysis.trend_change) >= 0 ? '▲' : '▼'} {Math.abs(result.seed_analysis.current_cumulative_trend ?? result.seed_analysis.trend_change ?? 0).toFixed(2)}%</div>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>현재 누적</div>
                        </div>
                    </div>
                </MetricCard>
                </div>
            </div>
        );
    }, [result, contentType]);

    const trendChartsSection = useMemo(() => {
        if (!result) return null;
        return (
            <div className="bm-grid bm-grid-split" style={{ gap: '24px', marginBottom: '24px' }}>
                <div className="glass-card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '800' }}>최근 12개월 추이</h3>
                        <InfoTooltip content={sectionDescriptions.trend12}><Info size={14} style={{ cursor: 'help', color: 'var(--text-muted)' }} /></InfoTooltip>
                    </div>
                    <div style={{ width: '100%', height: '300px' }}>
                        <ResponsiveContainer>
                            <LineChart data={result.monthly_trend}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" /><XAxis dataKey="month" fontSize={11} stroke="var(--text-muted)" /><YAxis fontSize={11} stroke="var(--text-muted)" /><Tooltip contentStyle={{ borderRadius: '12px', background: 'var(--bg-card)' }} /><Line type="monotone" dataKey="volume" stroke="var(--accent)" strokeWidth={3} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="glass-card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '800' }}>인기 주제</h3>
                        <InfoTooltip content={sectionDescriptions.popularTopics}><Info size={14} style={{ cursor: 'help', color: 'var(--text-muted)' }} /></InfoTooltip>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(result.popular_topics || []).map((topic, i) => (
                            <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', fontSize: '13px', border: '1px solid var(--border)' }}>{topic}</div>
                        ))}
                    </div>
                    <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '10px', fontSize: '12px' }}>
                        <strong style={{ color: 'var(--accent)', display: 'block', marginBottom: '4px' }}>AI 전략</strong>
                        <span style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{result.market_trend_summary}</span>
                    </div>
                </div>
            </div>
        );
    }, [result]);

    const sectionOrderSection = useMemo(() => {
        if (!result) return null;
        return (
            <div className="bm-grid bm-grid-half" style={{ gap: '16px', marginBottom: '24px' }}>
                {['pc', 'mobile'].map(type => (
                    <div key={type} className="glass-card" style={{ padding: 0 }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: '700', fontSize: '13px' }}>{type.toUpperCase()} 섹션 순서</span>
                                <InfoTooltip content={sectionDescriptions[type]}>
                                    <Info size={12} color="var(--text-muted)" style={{ cursor: 'help' }} />
                                </InfoTooltip>
                            </div>
                        </div>
                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            {(result.section_order?.[type] || []).map((name, i) => (
                                <div key={i} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border)' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', width: '12px' }}>{i + 1}</span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }, [result]);

    const relatedKeywordsSection = useMemo(() => {
        if (!result) return null;
        const totalCount = result.analysis_pool?.length || 0;
        return (
            <div className="glass-card" style={{ padding: 0, marginBottom: '24px' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '800' }}>연관 키워드 분석 ({totalCount})</h3>
                        <InfoTooltip content={sectionDescriptions.relatedKeywords}><Info size={14} style={{ cursor: 'help', color: 'var(--text-muted)' }} /></InfoTooltip>
                    </div>
                </div>
                <div style={{ padding: '12px 20px', display: 'flex', gap: '8px', overflowX: 'auto', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
                    <button onClick={() => { setActiveTab("전체"); setVisibleCount(10); }} className={`badge ${activeTab === "전체" ? 'badge-pending' : ''}`} style={{ border: 'none', cursor: 'pointer', background: activeTab === "전체" ? 'rgba(99, 102, 241, 0.2)' : 'none' }}>전체 ({totalCount})</button>
                    {(result.clusters || []).map(cluster => (
                        <button key={cluster.name} onClick={() => { setActiveTab(cluster.name); setVisibleCount(10); }} className={`badge ${activeTab === cluster.name ? 'badge-pending' : ''}`} style={{ border: 'none', cursor: 'pointer', background: activeTab === cluster.name ? 'rgba(99, 102, 241, 0.2)' : 'none' }}>{cluster.name} ({cluster.count})</button>
                    ))}
                </div>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('keyword')} style={{ cursor: 'pointer' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>키워드 {getSortIcon('keyword')}</div>
                            </th>
                            <th onClick={() => handleSort('search_volume')} style={{ cursor: 'pointer' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>월간 검색량 (Total) {getSortIcon('search_volume')}<InfoTooltip content={sectionDescriptions.colSearchVolume}><Info size={12} style={{ cursor: 'help', color: 'var(--text-muted)' }} /></InfoTooltip></div>
                            </th>
                            <th onClick={() => handleSort('document_count')} style={{ cursor: 'pointer' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>블로그 누적 발행량 {getSortIcon('document_count')}<InfoTooltip content={sectionDescriptions.colDocCount}><Info size={12} style={{ cursor: 'help', color: 'var(--text-muted)' }} /></InfoTooltip></div>
                            </th>
                            <th onClick={() => handleSort('similarity')} style={{ cursor: 'pointer' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>철자 유사도 {getSortIcon('similarity')}<InfoTooltip content={sectionDescriptions.colSimilarity}><Info size={12} style={{ cursor: 'help', color: 'var(--text-muted)' }} /></InfoTooltip></div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayData.map((item, idx) => (
                            <tr key={idx}>
                                <td style={{ fontWeight: '600' }}>
                                    <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{item.keyword}</span>
                                    {item.is_suggest && (
                                        <span style={{ marginLeft: '6px', fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(59,130,246,0.2)', color: '#60a5fa', fontWeight: '700' }}>연관</span>
                                    )}
                                </td>
                                <td style={{ textAlign: 'right' }}>{item.search_volume?.toLocaleString()}</td>
                                <td style={{ textAlign: 'right' }}>{item.document_count?.toLocaleString()}</td>
                                <td style={{ textAlign: 'center' }}>{item.similarity || '보통'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {visibleCount < totalCount && (
                    <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                        <button onClick={() => setVisibleCount(prev => prev + 20)} style={{ color: 'var(--accent)', fontWeight: '700', cursor: 'pointer', background: 'none', border: 'none' }}>나머지 {totalCount - visibleCount}개 연관 키워드 보기 ∨</button>
                    </div>
                )}
            </div>
        );
    }, [result, activeTab, displayData, visibleCount, sortConfig]);

    const smartBlocksSection = useMemo(() => {
        if (!result || !result.smart_blocks) return null;
        return (
            <div className="glass-card" style={{ padding: '20px 24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '800' }}>인기 주제 분석 (&apos;{result.seed_analysis.keyword}&apos;)</h3>
                        <InfoTooltip content={sectionDescriptions.smartBlocks}><Info size={14} style={{ cursor: 'help', color: 'var(--text-muted)' }} /></InfoTooltip>
                    </div>
                    <select className="select-field" style={{ width: '100px', height: '32px', padding: '0 12px', fontSize: '12px' }} value={displayCriteria} onChange={(e) => setDisplayCriteria(e.target.value)}>
                        <option value="블로그">블로그</option><option value="카페">카페</option>
                    </select>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ fontSize: '13px' }}>
                        <thead><tr style={{ textAlign: 'left' }}><th>순위</th><th>구분</th><th>작성자</th><th>제목</th><th>발행일</th><th>방문자</th></tr></thead>
                        <tbody>
                            {(result.smart_blocks.results[displayCriteria]?.[selectedTag]?.posts || []).map((post, i) => (
                                <tr key={i}>
                                    <td>{post.rank}</td>
                                    <td><span className="badge badge-pending">{post.source}</span></td>
                                    <td>{post.author}</td>
                                    <td><a href={post.url} target="_blank" rel="noreferrer" style={{ fontWeight: '600', color: 'var(--text-primary)', textDecoration: 'none' }}>{highlightKeyword(post.title, result.seed_analysis.keyword)}</a></td>
                                    <td style={{ color: 'var(--text-muted)' }}>{post.date}</td>
                                    <td style={{ fontWeight: '700' }}>{post.visitors.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }, [result, displayCriteria, selectedTag]);

    const applyPreset = (days) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        handleTrendOptionChange({
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
            timeUnit: days >= 365 ? 'month' : 'date',
        });
    };

    const activeDays = Math.round((new Date(trendOptions.endDate) - new Date(trendOptions.startDate)) / (1000 * 60 * 60 * 24));

    const advancedTrendSection = useMemo(() => {
        if (!result) return null;
        return (
            <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
                {/* 헤더 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '800' }}>상세 검색량 트렌드</h3>
                        <InfoTooltip content={sectionDescriptions.advancedTrend}><Info size={14} style={{ cursor: 'help', color: 'var(--text-muted)' }} /></InfoTooltip>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <select
                            className="select-field"
                            style={{ width: '70px', height: '32px', padding: '0 8px', fontSize: '12px' }}
                            value={trendOptions.timeUnit}
                            onChange={(e) => handleTrendOptionChange({ timeUnit: e.target.value })}
                        >
                            <option value="date">일간</option>
                            <option value="week">주간</option>
                            <option value="month">월간</option>
                        </select>
                        <button
                            data-tour="kw-compare-btn"
                            className="btn-primary"
                            style={{ height: '32px', padding: '0 12px', fontSize: '12px' }}
                            onClick={() => {
                                setTempKeywords(trendKeywords.length > 0 ? [...trendKeywords, ""] : [result.seed_analysis.keyword, ""]);
                                setShowCompareModal(true);
                            }}
                        >
                            비교 분석
                        </button>
                    </div>
                </div>

                {/* 기간 설정 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {PERIOD_PRESETS.map(({ label, days }) => (
                            <button
                                key={label}
                                onClick={() => applyPreset(days)}
                                style={{
                                    height: '30px', padding: '0 10px', fontSize: '12px', fontWeight: '700',
                                    borderRadius: '6px', border: '1px solid var(--border)', cursor: 'pointer',
                                    background: activeDays === days ? 'var(--accent)' : 'var(--bg-secondary)',
                                    color: activeDays === days ? '#fff' : 'var(--text-muted)',
                                    transition: 'all 0.15s'
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                            type="date"
                            value={trendOptions.startDate}
                            max={trendOptions.endDate}
                            onChange={(e) => handleTrendOptionChange({ startDate: e.target.value })}
                            style={{
                                height: '30px', padding: '0 8px', fontSize: '12px',
                                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer'
                            }}
                        />
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>~</span>
                        <input
                            type="date"
                            value={trendOptions.endDate}
                            min={trendOptions.startDate}
                            max={new Date().toISOString().split('T')[0]}
                            onChange={(e) => handleTrendOptionChange({ endDate: e.target.value })}
                            style={{
                                height: '30px', padding: '0 8px', fontSize: '12px',
                                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer'
                            }}
                        />
                    </div>
                    {trendKeywords.length > 1 && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                            비교 중: {trendKeywords.join(' vs ')}
                        </span>
                    )}
                </div>

                {/* 차트 */}
                <div style={{ height: '300px', position: 'relative' }}>
                    {trendLoading && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                            <div className="animate-spin" style={{ width: '20px', height: '20px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%' }} />
                        </div>
                    )}
                    <ResponsiveContainer>
                        <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                            <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} />
                            <YAxis tickFormatter={(v) => v.toLocaleString()} stroke="var(--text-muted)" fontSize={11} />
                            <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }} />
                            <Legend verticalAlign="top" height={36} />
                            {trendKeywords.map((kw, idx) => (
                                <Line key={kw} type="monotone" dataKey={kw} stroke={COLORS[idx % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        );
    }, [result, trendData, trendLoading, trendKeywords, trendOptions, activeDays]);

    const demographicsSection = useMemo(() => {
        if (!result) return null;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* 1행: 성별 | 연령별 */}
                <div className="bm-grid bm-grid-split-rev" style={{ gap: '24px' }}>
                    <div className="glass-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>성별 비중</h3>
                            <InfoTooltip content={sectionDescriptions.gender}><Info size={13} style={{ cursor: 'help', color: 'var(--text-muted)' }} /></InfoTooltip>
                        </div>
                        <div style={{ height: '200px' }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={[{ name: '여성', value: result.demographics.gender.female }, { name: '남성', value: result.demographics.gender.male }]} innerRadius={60} outerRadius={85} dataKey="value"><Cell fill="#ec4899" /><Cell fill="#3b82f6" /></Pie><Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="glass-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>연령별 검색 비중</h3>
                            <InfoTooltip content={sectionDescriptions.age}><Info size={13} style={{ cursor: 'help', color: 'var(--text-muted)' }} /></InfoTooltip>
                        </div>
                        <div style={{ height: '200px' }}>
                            <ResponsiveContainer>
                                <BarChart data={Object.entries(result.demographics.age).map(([k, v]) => ({ name: k.replace('s', '대'), value: v }))}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" /><XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} /><YAxis tickFormatter={v => `${v}%`} stroke="var(--text-muted)" fontSize={11} /><Tooltip /><Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
                {/* 2행: 월별 | 요일별 */}
                <div className="bm-grid bm-grid-half" style={{ gap: '24px' }}>
                    <div className="glass-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>월별 검색 비율</h3>
                            <InfoTooltip content={sectionDescriptions.monthly}>
                                <Info size={13} style={{ cursor: 'help', color: 'var(--text-muted)' }} />
                            </InfoTooltip>
                        </div>
                        <div style={{ height: '200px' }}>
                            <ResponsiveContainer>
                                <BarChart data={Object.entries(result.seasonality?.monthly || {}).map(([k, v]) => ({ name: k, value: v }))}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" /><XAxis dataKey="name" fontSize={10} stroke="var(--text-muted)" /><YAxis tickFormatter={v => `${v}%`} stroke="var(--text-muted)" fontSize={11} /><Tooltip formatter={(v) => [`${v}%`, '검색 비율']} /><Bar dataKey="value" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="glass-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>요일별 검색 비율</h3>
                            <InfoTooltip content={sectionDescriptions.weekly}>
                                <Info size={13} style={{ cursor: 'help', color: 'var(--text-muted)' }} />
                            </InfoTooltip>
                        </div>
                        <div style={{ height: '200px' }}>
                            <ResponsiveContainer>
                                <BarChart data={['일', '월', '화', '수', '목', '금', '토'].map(day => ({ name: day, value: result.seasonality?.weekly?.[day] ?? 0 }))}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={13} fontWeight={600} />
                                    <YAxis tickFormatter={v => `${v}%`} stroke="var(--text-muted)" fontSize={11} />
                                    <Tooltip formatter={(v) => [`${v}%`, '검색 비율']} />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {['일', '월', '화', '수', '목', '금', '토'].map((day) => {
                                            const vals = ['일', '월', '화', '수', '목', '금', '토'].map(d => result.seasonality?.weekly?.[d] ?? 0);
                                            const maxVal = Math.max(...vals);
                                            const val = result.seasonality?.weekly?.[day] ?? 0;
                                            return <Cell key={day} fill={val === maxVal ? 'var(--accent)' : '#475569'} />;
                                        })}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        );
    }, [result]);

    return (
        <div className="animate-in" style={{ paddingBottom: '100px' }}>
            {/* Header Area */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px' }}>
                        황금키워드 정밀 분석
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                        네이버 빅데이터를 분석하여 최적의 블로그 공략 전략을 제안합니다.
                    </p>
                </div>
                {result && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <Calendar size={13} style={{ marginBottom: '-2px', marginRight: '6px' }} />
                        분석 시점: {result.analysis_timestamp}
                    </div>
                )}
            </div>

            {/* Search Input Area */}
            <div data-tour="kw-search-input" className="glass-card" style={{ marginBottom: '40px', padding: '24px' }}>
                <form onSubmit={handleAnalyze} style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            className="input-field"
                            style={{ paddingLeft: '48px', height: '54px' }}
                            placeholder="분석할 대표 키워드를 입력하세요 (예: 제주도 여행, 갤럭시 S25)"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            disabled={loading}
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn-primary"
                        style={{ height: '54px', padding: '0 32px' }}
                        disabled={loading || !keyword.trim()}
                    >
                        {loading ? "분석 중..." : "실시간 정밀 분석"}
                    </button>
                </form>
                {loading && (
                    <div style={{ marginTop: '24px' }}>
                        {/* 전체 진행바 */}
                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                    {progressStep > 0 && progressStep <= ANALYSIS_STEPS.length
                                        ? ANALYSIS_STEPS[progressStep - 1].label
                                        : '분석 준비 중...'}
                                </span>
                                <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: '700' }}>{progressPercent}%</span>
                            </div>
                            <div style={{ height: '6px', background: 'rgba(99,102,241,0.12)', borderRadius: '99px', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${progressPercent}%`,
                                    background: 'linear-gradient(90deg, #6366f1, #a78bfa)',
                                    borderRadius: '99px',
                                    transition: 'width 0.6s ease'
                                }} />
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                                {progressStep > 0 && progressStep <= ANALYSIS_STEPS.length
                                    ? ANALYSIS_STEPS[progressStep - 1].desc
                                    : ''}
                            </div>
                        </div>

                        {/* 단계별 타임라인 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {ANALYSIS_STEPS.map((step) => {
                                const isDone = progressStep > step.id;
                                const isActive = progressStep === step.id;
                                return (
                                    <div key={step.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '10px 14px',
                                        borderRadius: '10px',
                                        background: isActive
                                            ? 'rgba(99,102,241,0.08)'
                                            : isDone ? 'rgba(16,185,129,0.05)' : 'transparent',
                                        border: isActive
                                            ? '1px solid rgba(99,102,241,0.25)'
                                            : isDone ? '1px solid rgba(16,185,129,0.2)' : '1px solid transparent',
                                        transition: 'all 0.3s ease'
                                    }}>
                                        {/* 아이콘 */}
                                        <div style={{
                                            width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: isDone
                                                ? 'rgba(16,185,129,0.15)'
                                                : isActive ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                                            border: isDone
                                                ? '1px solid rgba(16,185,129,0.4)'
                                                : isActive ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--border)',
                                        }}>
                                            {isDone ? (
                                                <span style={{ fontSize: '14px' }}>✓</span>
                                            ) : isActive ? (
                                                <div style={{
                                                    width: '10px', height: '10px', borderRadius: '50%',
                                                    border: '2px solid #6366f1', borderTopColor: 'transparent',
                                                    animation: 'spin 0.8s linear infinite'
                                                }} />
                                            ) : (
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700' }}>{step.id}</span>
                                            )}
                                        </div>
                                        {/* 라벨 */}
                                        <div>
                                            <div style={{
                                                fontSize: '13px', fontWeight: isActive ? '700' : '500',
                                                color: isDone ? '#10b981' : isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                                                transition: 'color 0.3s'
                                            }}>
                                                {step.label}
                                            </div>
                                            {isActive && (
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    {step.desc}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {error && (
                    <div style={{ marginTop: '20px', color: 'var(--error)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '12px' }}>
                        <AlertCircle size={16} /> {error}
                    </div>
                )}
            </div>

            {result ? (
                <div className="animate-in">
                    {topStatsSection}
                    <div data-tour="kw-trend-chart">{trendChartsSection}</div>
                    {sectionOrderSection}
                    <div data-tour="kw-related-table">{relatedKeywordsSection}</div>
                    <div data-tour="kw-smartblocks">{smartBlocksSection}</div>
                    <div style={{ position: 'relative' }}>
                        {advancedTrendSection}
                        {/* Keyword Compare Modal — 트렌드 카드 기준 오버레이 */}
                        <Modal open={showCompareModal} onClose={() => setShowCompareModal(false)} variant="inline" width={420} zIndex={100}>
                                    <button
                                        onClick={() => setShowCompareModal(false)}
                                        style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                    >
                                        <Plus size={22} style={{ transform: 'rotate(45deg)' }} />
                                    </button>
                                    <h2 style={{ fontSize: '20px', fontWeight: '900', marginBottom: '20px', textAlign: 'center', letterSpacing: '-0.02em' }}>비교 분석</h2>

                                    {/* 비교 기간 설정 */}
                                    <div style={{ marginBottom: '16px', padding: '14px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '10px' }}>비교 기간</div>
                                        <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                                            {PERIOD_PRESETS.map(({ label, days }) => {
                                                const d = Math.round((new Date(trendOptions.endDate) - new Date(trendOptions.startDate)) / (1000 * 60 * 60 * 24));
                                                return (
                                                    <button
                                                        key={label}
                                                        onClick={() => {
                                                            const end = new Date();
                                                            const start = new Date();
                                                            start.setDate(end.getDate() - days);
                                                            setTrendOptions(prev => ({
                                                                ...prev,
                                                                startDate: start.toISOString().split('T')[0],
                                                                endDate: end.toISOString().split('T')[0],
                                                                timeUnit: days >= 365 ? 'month' : 'date',
                                                            }));
                                                        }}
                                                        style={{
                                                            flex: 1, height: '28px', fontSize: '12px', fontWeight: '700',
                                                            borderRadius: '6px', border: '1px solid var(--border)', cursor: 'pointer',
                                                            background: d === days ? 'var(--accent)' : 'transparent',
                                                            color: d === days ? '#fff' : 'var(--text-muted)',
                                                        }}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="date"
                                                value={trendOptions.startDate}
                                                max={trendOptions.endDate}
                                                onChange={(e) => setTrendOptions(prev => ({ ...prev, startDate: e.target.value }))}
                                                style={{ flex: 1, height: '32px', padding: '0 8px', fontSize: '12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                                            />
                                            <span style={{ color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0 }}>~</span>
                                            <input
                                                type="date"
                                                value={trendOptions.endDate}
                                                min={trendOptions.startDate}
                                                max={new Date().toISOString().split('T')[0]}
                                                onChange={(e) => setTrendOptions(prev => ({ ...prev, endDate: e.target.value }))}
                                                style={{ flex: 1, height: '32px', padding: '0 8px', fontSize: '12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                                            />
                                        </div>
                                    </div>

                                    {/* 비교 키워드 목록 */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                                        {tempKeywords.map((kw, idx) => (
                                            <div key={idx} style={{ position: 'relative' }}>
                                                <input
                                                    className="input-field"
                                                    style={{
                                                        height: '46px', borderRadius: '10px', padding: '0 40px 0 14px',
                                                        borderLeft: `4px solid ${COLORS[idx % COLORS.length]}`,
                                                        background: 'var(--bg-secondary)', fontSize: '14px'
                                                    }}
                                                    value={kw}
                                                    onChange={(e) => {
                                                        const newKws = [...tempKeywords];
                                                        newKws[idx] = e.target.value;
                                                        setTempKeywords(newKws);
                                                    }}
                                                    placeholder={idx === 0 ? "기준 키워드" : `비교 키워드 ${idx}`}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleCompareApply(); }}
                                                />
                                                {idx > 0 && (
                                                    <button
                                                        onClick={() => setTempKeywords(tempKeywords.filter((_, i) => i !== idx))}
                                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                    >
                                                        <Plus size={15} style={{ transform: 'rotate(45deg)' }} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {tempKeywords.length < 5 && (
                                            <button
                                                onClick={() => setTempKeywords([...tempKeywords, ""])}
                                                style={{ background: 'var(--bg-secondary)', border: '1px dashed var(--border)', borderRadius: '10px', height: '46px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                                            >
                                                + 키워드 추가 (최대 5개)
                                            </button>
                                        )}
                                    </div>

                                    <div className="bm-grid bm-grid-half" style={{ gap: '12px' }}>
                                        <button
                                            onClick={() => setTempKeywords([result.seed_analysis.keyword, ""])}
                                            style={{ height: '48px', borderRadius: '12px', border: '1px solid var(--border)', background: 'none', fontWeight: '800', cursor: 'pointer', color: 'var(--text-primary)' }}
                                        >
                                            초기화
                                        </button>
                                        <button
                                            onClick={handleCompareApply}
                                            style={{ height: '48px', borderRadius: '12px', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)' }}
                                        >
                                            적용하기
                                        </button>
                                    </div>
                        </Modal>
                    </div>
                    <div data-tour="kw-demographics">{demographicsSection}</div>

                </div>
            ) : (
                <div style={{
                    textAlign: "center", padding: "120px 0", color: "var(--text-muted)",
                    display: 'flex', flexDirection: 'column', alignItems: 'center'
                }}>
                    <div style={{
                        width: '80px', height: '80px', borderRadius: '24px', background: 'var(--bg-secondary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px'
                    }}>
                        <Search size={40} color="var(--text-muted)" />
                    </div>
                    <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '8px' }}>분석 대기 중</h3>
                    <p style={{ maxWidth: '300px', lineHeight: 1.6 }}>키워드를 입력하시면 실시간 검색 동향과<br />황금 키워드 전략을 제안해 드립니다.</p>
                </div>
            )}

            <SubscriptionGateModal open={showGateModal} onClose={() => setShowGateModal(false)} />
            <OnboardingTour pageKey="keywords" steps={keywordsTourSteps} />
        </div>
    );
}
