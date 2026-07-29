"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/lib/ThemeProvider";

const PROCESS_STEPS = [
  { num: "01", title: "주제 또는 키워드 입력", desc: "블로그 주제나 메인 키워드를 입력합니다. 참고 URL이나 이미지도 첨부 가능합니다." },
  { num: "02", title: "AI 원고 미리보기 생성", desc: "Gemini가 SEO 최적화 원고를 작성합니다. 마음에 들지 않으면 재생성하거나 직접 편집하세요." },
  { num: "03", title: "이미지·썸네일 자동 제작", desc: "본문에 맞는 이미지를 AI가 생성하고 썸네일에 텍스트를 합성합니다." },
  { num: "04", title: "네이버 블로그 자동 발행", desc: "Chrome 확장 프로그램이 스마트에디터를 직접 조작해 발행합니다." },
  { num: "05", title: "SEO 순위 자동 추적", desc: "발행 후 매일 검색 순위를 자동으로 체크하고 대시보드에 기록합니다." },
];

const DEMO_STEP_MS = 4400;
const DEMO_TOPIC = "강남 맛집 추천";
const DEMO_TITLE = "강남 맛집 추천, 이 골목 하나면 실패 없어요";
const DEMO_BODY = "요즘 강남에서 밥 약속 잡을 때마다 고민되시죠? 오늘은 직접 다녀온 찐맛집을 소개해드릴게요.";

const HERO_TABS = [
  { key: "post", label: "새 포스팅", url: "blogmaster.ai/dashboard/post" },
  { key: "keywords", label: "황금 키워드", url: "blogmaster.ai/dashboard/keywords" },
  { key: "analytics", label: "순위 분석", url: "blogmaster.ai/dashboard/analytics" },
];
const HERO_TAB_MS = 7600;
const HERO_INPUT_MS = 1400;

// ── "새 포스팅" 전체화면 재현 + 카메라 줌인 데모 ──
// 작은 위젯 프레임(뷰포트) 크기는 그대로 두고, 그 안에 실제 /dashboard/post 전체 화면을
// 축소 복제해 넣은 뒤, transform(scale+translate)으로 카메라가 각 기능 위로 이동/확대한다.
const POST_MOCK_W = 1000;
const POST_VIEWPORT_W = 520;
const POST_VIEWPORT_H = 390;

// scale은 "왼쪽 폼 카드 폭(420px)이 위젯 폭(400px) 안에 여유 있게 다 들어오는" 값이어야
// 카드가 가로로 잘리지 않는다 — 420 / scale <= 400 근방이 아니라 여유를 둬서 0.8 전후로 설정.
const POST_SHOTS = [
  { label: "새 포스팅 워크스페이스", scale: 0.42, focusX: 500, focusY: 380 },
  { label: "다양한 말투로 원고 스타일을 선택하세요", scale: 0.8, focusX: 230, focusY: 360 },
  { label: "주제만 입력하면 AI가 원고를 작성합니다", scale: 0.8, focusX: 230, focusY: 667 },
  { label: "즉시 발행 또는 예약 발행까지 한 번에", scale: 0.8, focusX: 230, focusY: 864 },
];
const POST_SHOT_MS = HERO_TAB_MS / POST_SHOTS.length;

function postCameraTransform(shot) {
  const tx = POST_VIEWPORT_W / 2 - shot.focusX * shot.scale;
  const ty = POST_VIEWPORT_H / 2 - shot.focusY * shot.scale;
  return `translate(${tx}px, ${ty}px) scale(${shot.scale})`;
}

function MiniCard({ children, style }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 14, padding: 16, marginBottom: 14, ...style }}>
      {children}
    </div>
  );
}

// 3개 목업이 공통으로 쓰는 탑네비 재현 (active = navItems 인덱스)
function MockTopNav({ active }) {
  return (
    <div style={{ height: 56, background: "#fff", borderBottom: "1px solid #e7e5e4", display: "flex", alignItems: "center", padding: "0 20px", gap: 20 }}>
      <span style={{ fontSize: 15, fontWeight: 900, color: "#1b4332" }}>블로그 마스터 AI</span>
      {["대시보드", "네이버 계정", "새 포스팅", "황금 키워드", "순위 분석", "설정 및 구독"].map((m, i) => (
        <span key={m} style={{
          fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8,
          background: i === active ? "rgba(27,67,50,0.12)" : "transparent",
          color: i === active ? "#1b4332" : "#a8a29e",
        }}>
          {m}
        </span>
      ))}
    </div>
  );
}

// 카메라 뷰포트 공통 래퍼 — overflow:hidden 프레임 안에서 mock 콘텐츠를 확대/이동한다.
function CameraDemo({ shots, shotMs, elapsed, renderMock }) {
  const shotIdx = Math.min(shots.length - 1, Math.floor(elapsed / shotMs));
  const shot = shots[shotIdx];
  const shotElapsed = elapsed - shotIdx * shotMs;

  return (
    <div>
      <div style={{
        width: POST_VIEWPORT_W, height: POST_VIEWPORT_H, margin: "0 auto",
        overflow: "hidden", position: "relative", background: "#f7f5f3", borderRadius: 8,
      }}>
        <div style={{
          transform: postCameraTransform(shot),
          transformOrigin: "0 0",
          transition: "transform 1.1s cubic-bezier(0.65,0,0.35,1)",
        }}>
          {renderMock(shotIdx, shotElapsed)}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
        <span style={{ fontSize: 13, color: "#1b4332", flexShrink: 0 }}>▶</span>
        <span style={{ fontSize: 12.5, color: "#57534e", lineHeight: 1.5 }}>{shot.label}</span>
      </div>
    </div>
  );
}

// 실제 /dashboard/post 화면 전체(탑네비 + 폼 + AI 미리보기)를 축소 좌표계로 재현.
function PostFullPageMock({ typedTopic }) {
  return (
    <div style={{ width: POST_MOCK_W, background: "#f7f5f3" }}>
      <MockTopNav active={2} />

      {/* 헤더 */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#1c1917" }}>새 포스팅 워크스페이스</div>
        <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 4, marginBottom: 20 }}>AI와 실시간으로 소통하며 완벽한 네이버 블로그 포스팅을 완성하세요.</div>
      </div>

      {/* 2단 레이아웃 */}
      <div style={{ display: "flex", gap: 20, padding: "0 20px 20px", alignItems: "flex-start" }}>
        {/* 왼쪽 폼 */}
        <div style={{ width: 420, flexShrink: 0 }}>
          <MiniCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#78716c", marginBottom: 8 }}>네이버 계정</div>
            <div style={{ background: "#f7f5f3", border: "1px solid #e7e5e4", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#1c1917" }}>
              ss7649ss@naver.com (미술)
            </div>
          </MiniCard>

          <MiniCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#78716c", marginBottom: 10 }}>글 말투</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 12 }}>
              {[["😊", "친근한"], ["💕", "여성적"], ["💪", "남성적"], ["😎", "일상체"], ["📋", "건강"]].map(([emoji, label], i) => (
                <div key={label} style={{
                  textAlign: "center", padding: "8px 2px", borderRadius: 10, fontSize: 9,
                  border: i === 0 ? "1.5px solid #1b4332" : "1px solid #e7e5e4",
                  background: i === 0 ? "rgba(27,67,50,0.08)" : "#fff",
                  color: i === 0 ? "#1b4332" : "#78716c", fontWeight: 700,
                }}>
                  <div style={{ fontSize: 15 }}>{emoji}</div>
                  {label}
                </div>
              ))}
            </div>
            <div style={{ background: "rgba(27,67,50,0.06)", border: "1px solid rgba(27,67,50,0.25)", borderRadius: 10, padding: 12, fontSize: 11, color: "#57534e", lineHeight: 1.7 }}>
              오늘은 제가 직접 다녀온 곳을 소개해 드릴게요 😊<br />
              솔직히 처음엔 별 기대 안 했는데, 가보니까 진짜 너무 좋더라고요.
            </div>
          </MiniCard>

          <MiniCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#78716c", marginBottom: 10 }}>컨텐츠 생성 방식</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {["AI 추천", "직접 입력", "이미지 참조"].map((label, i) => (
                <div key={label} style={{
                  textAlign: "center", padding: "10px 4px", borderRadius: 10, fontSize: 10.5, fontWeight: 700,
                  border: i === 1 ? "1.5px solid #1b4332" : "1px solid #e7e5e4",
                  background: i === 1 ? "rgba(27,67,50,0.08)" : "#fff",
                  color: i === 1 ? "#1b4332" : "#78716c",
                }}>
                  {label}
                </div>
              ))}
            </div>
          </MiniCard>

          <MiniCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#78716c", marginBottom: 10 }}>주제가 되는 내용</div>
            <div style={{ background: "#f7f5f3", border: "1.5px solid #1b4332", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#1c1917", minHeight: 20, marginBottom: 10 }}>
              {typedTopic}<span className="demo-caret">|</span>
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#78716c", marginBottom: 6 }}>작성 세부 요청사항 (선택)</div>
            <div style={{ background: "#f7f5f3", border: "1px solid #e7e5e4", borderRadius: 10, padding: "10px 12px", fontSize: 11, color: "#c4c1bf" }}>
              예: 가족여행이니 접근성이 좋다는 내용을 꼭 넣어주세요.
            </div>
          </MiniCard>

          <MiniCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#78716c", marginBottom: 10 }}>언제 발행할까요?</div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: 10, background: "#1b4332", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                ⚡ 즉시 발행
              </div>
              <div style={{ flex: 1, textAlign: "center", padding: "10px", borderRadius: 10, border: "1px solid #e7e5e4", color: "#78716c", fontSize: 12, fontWeight: 700 }}>
                🕐 예약 발행
              </div>
            </div>
          </MiniCard>

          <MiniCard style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ flex: 1, textAlign: "center", padding: "12px", borderRadius: 10, border: "1px solid #e7e5e4", fontSize: 13, fontWeight: 700, color: "#78716c" }}>원고 생성</span>
              <span style={{ flex: 1, textAlign: "center", padding: "12px", borderRadius: 10, background: "#1b4332", fontSize: 13, fontWeight: 700, color: "#fff" }}>발행</span>
            </div>
          </MiniCard>
        </div>

        {/* 오른쪽 AI 실시간 미리보기 */}
        <div style={{ flex: 1, background: "#fff", border: "1px solid #e7e5e4", borderRadius: 16, padding: 20, alignSelf: "stretch" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#78716c", textTransform: "uppercase" }}>AI 실시간 미리보기</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: "#d6d3d1" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🖋️</div>
            <div style={{ fontSize: 12, textAlign: "center" }}>왼쪽 양식을 작성하고<br /><strong>'원고 생성'</strong> 버튼을 클릭하세요.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 카메라 뷰포트 — overflow:hidden 프레임 안에서 전체 화면 목업을 확대/이동한다.
function PostCameraDemo({ elapsed }) {
  return (
    <CameraDemo
      shots={POST_SHOTS}
      shotMs={POST_SHOT_MS}
      elapsed={elapsed}
      renderMock={(shotIdx, shotElapsed) => {
        const typedTopic = shotIdx >= 2 ? DEMO_TOPIC.slice(0, Math.floor(shotElapsed / 85)) : "";
        return <PostFullPageMock typedTopic={typedTopic} />;
      }}
    />
  );
}

// ── "황금 키워드" 전체화면 재현 + 카메라 줌인 데모 ──
const KEYWORDS_SHOTS = [
  { label: "황금키워드 정밀 분석", scale: 0.42, focusX: 500, focusY: 260 },
  { label: "대표 키워드를 입력하면 실시간으로 분석합니다", scale: 0.8, focusX: 150, focusY: 188 },
  { label: "등급·검색량·발행량·포화지수까지 한눈에", scale: 0.8, focusX: 400, focusY: 291 },
  { label: "최근 12개월 검색 추이를 그래프로 한눈에", scale: 0.62, focusX: 330, focusY: 409 },
];
const KEYWORDS_SHOT_MS = HERO_TAB_MS / KEYWORDS_SHOTS.length;

function KeywordsFullPageMock({ typedKeyword }) {
  const stats = [
    { label: "키워드 등급", value: "S", color: "#f59e0b" },
    { label: "월간 검색량", value: "49,500" },
    { label: "월간 발행량", value: "1,204" },
    { label: "포화 지수", value: "낮음", color: "#10b981" },
    { label: "예상 검색량", value: "52.1만" },
  ];
  return (
    <div style={{ width: POST_MOCK_W, background: "#f7f5f3" }}>
      <MockTopNav active={3} />

      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#1c1917" }}>황금키워드 정밀 분석</div>
        <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 4, marginBottom: 20 }}>네이버 빅데이터를 분석하여 최적의 블로그 공략 전략을 제안합니다.</div>
      </div>

      <div style={{ padding: "0 20px 20px" }}>
        <MiniCard>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#a8a29e" }}>🔍</span>
              <div style={{ background: "#f7f5f3", border: "1px solid #e7e5e4", borderRadius: 10, padding: "12px 14px 12px 38px", fontSize: 13, color: "#1c1917" }}>
                {typedKeyword}<span className="demo-caret">|</span>
              </div>
            </div>
            <div style={{ padding: "0 20px", borderRadius: 10, background: "#1b4332", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
              실시간 정밀 분석
            </div>
          </div>
        </MiniCard>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 14 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 12, padding: "14px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 9.5, color: "#a8a29e", fontWeight: 700, marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: s.color || "#1c1917" }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          <MiniCard style={{ flex: 2, marginBottom: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#78716c", marginBottom: 10 }}>최근 12개월 추이</div>
            <div style={{ height: 90, display: "flex", alignItems: "flex-end", gap: 4 }}>
              {[40, 55, 45, 70, 60, 80, 65, 90, 75, 85, 95, 88].map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 10 ? "#1b4332" : "#d8f3dc", borderRadius: "2px 2px 0 0" }} />
              ))}
            </div>
          </MiniCard>
          <MiniCard style={{ flex: 1, marginBottom: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#78716c", marginBottom: 10 }}>인기 주제</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {["강남 맛집 추천", "강남역 데이트", "강남 브런치"].map((t) => (
                <div key={t} style={{ fontSize: 10.5, padding: "6px 8px", background: "#f7f5f3", borderRadius: 8, color: "#57534e" }}>{t}</div>
              ))}
            </div>
          </MiniCard>
        </div>
      </div>
    </div>
  );
}

function KeywordsCameraDemo({ elapsed }) {
  return (
    <CameraDemo
      shots={KEYWORDS_SHOTS}
      shotMs={KEYWORDS_SHOT_MS}
      elapsed={elapsed}
      renderMock={(shotIdx, shotElapsed) => {
        const typedKeyword = shotIdx >= 1 ? "강남 맛집".slice(0, Math.floor(shotElapsed / 110)) : "";
        return <KeywordsFullPageMock typedKeyword={typedKeyword} />;
      }}
    />
  );
}

// ── "순위 분석" 전체화면 재현 + 카메라 줌인 데모 ──
const ANALYTICS_SHOTS = [
  { label: "순위 분석", scale: 0.42, focusX: 500, focusY: 260 },
  { label: "키워드를 입력하면 내 게시글 순위를 확인합니다", scale: 0.8, focusX: 150, focusY: 174 },
  { label: "네이버 검색 API 기준 1위~200위까지 자동 탐색", scale: 0.7, focusX: 260, focusY: 231 },
  { label: "게시글별 실제 검색 순위를 한눈에", scale: 0.8, focusX: 920, focusY: 300 },
];
const ANALYTICS_SHOT_MS = HERO_TAB_MS / ANALYTICS_SHOTS.length;

function AnalyticsResultCard({ title, rank }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontSize: 10.5, color: "#a8a29e", marginTop: 5, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ background: "#d8f3dc", color: "#1b4332", padding: "1px 7px", borderRadius: 20, fontWeight: 700 }}>@myblog</span>
          2026.03.14
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#10b981" }}>#{rank}위</div>
        <div style={{ fontSize: 9.5, color: "#a8a29e" }}>{Math.ceil(rank / 10)}p</div>
      </div>
    </div>
  );
}

function AnalyticsFullPageMock({ typedKeyword }) {
  return (
    <div style={{ width: POST_MOCK_W, background: "#f7f5f3" }}>
      <MockTopNav active={4} />

      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#1c1917" }}>순위 분석</div>
        <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 4, marginBottom: 20 }}>키워드를 입력하면 내 블로그 게시글이 몇 위인지 확인할 수 있습니다.</div>
      </div>

      <div style={{ padding: "0 20px 20px" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: "#fff", border: "1px solid #e7e5e4", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#1c1917" }}>
            {typedKeyword}<span className="demo-caret">|</span>
          </div>
          <div style={{ padding: "0 20px", borderRadius: 10, background: "#1b4332", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
            순위 검색
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10, padding: "9px 12px", fontSize: 11, color: "#f59e0b", fontWeight: 600, marginBottom: 16 }}>
          ⚠️ 네이버 검색 API 기준으로 조회된 결과입니다
        </div>

        <AnalyticsResultCard title="강남 맛집 찐맛집 리스트 총정리" rank={7} />
        <AnalyticsResultCard title="강남역 데이트 코스 베스트 5" rank={23} />
        <AnalyticsResultCard title="강남 브런치 카페 추천" rank={41} />
      </div>
    </div>
  );
}

function AnalyticsCameraDemo({ elapsed }) {
  return (
    <CameraDemo
      shots={ANALYTICS_SHOTS}
      shotMs={ANALYTICS_SHOT_MS}
      elapsed={elapsed}
      renderMock={(shotIdx, shotElapsed) => {
        const typedKeyword = shotIdx >= 1 ? "강남 맛집".slice(0, Math.floor(shotElapsed / 110)) : "";
        return <AnalyticsFullPageMock typedKeyword={typedKeyword} />;
      }}
    />
  );
}

// 히어로 우측 패널 — 새 포스팅/황금 키워드/순위 분석 3개 탭을 자동으로 순환.
// "기능 버튼만 보여주는 미니 위젯"이 아니라, 실제 각 페이지의 한 영역을 클로즈업한 것처럼
// 실제 컴포넌트(트리거 버튼·말투 칩·통계 카드·순위 카드 등)를 밀도 있게 재현한다.
// 가장자리에 살짝 잘려 보이는 요소를 넣어 "더 큰 실제 화면의 일부를 확대한 것" 같은 느낌을 준다.
function HeroDemoPanel({ tabIndex, elapsed, onJump }) {
  const tab = HERO_TABS[tabIndex];
  const inputElapsed = Math.min(elapsed, HERO_INPUT_MS);
  const resultElapsed = Math.max(0, elapsed - HERO_INPUT_MS);

  return (
    <div style={{ background: "#fff" }}>
      <div style={{ padding: 20, minHeight: 320, background: "#fff", overflow: "hidden" }}>
        {tab.key === "post" && <PostCameraDemo elapsed={elapsed} />}

        {tab.key === "keywords" && <KeywordsCameraDemo elapsed={elapsed} />}

        {tab.key === "analytics" && <AnalyticsCameraDemo elapsed={elapsed} />}
      </div>

      <div style={{ display: "flex", gap: 6, padding: "12px 14px", background: "#f7f5f3", borderTop: "1px solid #e7e5e4" }}>
        {HERO_TABS.map((t, i) => (
          <button
            key={t.key}
            onClick={() => onJump(i)}
            style={{
              flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
              border: i === tabIndex ? "1.5px solid #1b4332" : "1px solid #e7e5e4",
              background: i === tabIndex ? "rgba(27,67,50,0.08)" : "#fff",
              color: i === tabIndex ? "#1b4332" : "#78716c",
              transition: "all 0.2s ease",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 작동 방식 5단계 옆에 짝지어 보여주는 시연 애니메이션 패널.
// 지어낸 가짜 UI가 아니라 실제 /dashboard/post 화면(라이트 테마 · glass-card · 오렌지 액센트)의
// 색상·컴포넌트 스타일을 그대로 재현한 축소판 — 실제 동영상/캔버스 없이 타이머(elapsed)로
// 텍스트를 타이핑하듯 채워나가는 순수 CSS/JS 연출.
function ProcessDemoPanel({ stepIndex, elapsed, onJump }) {
  const step = PROCESS_STEPS[stepIndex];
  const typedTopic = DEMO_TOPIC.slice(0, Math.floor(elapsed / 90));
  const typedTitle = DEMO_TITLE.slice(0, Math.floor(elapsed / 55));
  const typedBody = DEMO_BODY.slice(0, Math.floor(elapsed / 22));
  const publishPct = Math.min(100, Math.round((elapsed / (DEMO_STEP_MS - 200)) * 100));

  return (
    <div style={{ background: "#fff" }}>
      <div style={{ padding: 28, minHeight: 320, display: "flex", flexDirection: "column", justifyContent: "center", background: "#fff" }}>
        {stepIndex === 0 && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
              {["AI 추천", "직접 입력", "이미지 참조"].map((label, i) => (
                <div key={label} style={{
                  textAlign: "center", padding: "10px 6px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                  border: i === 1 ? "1.5px solid #1b4332" : "1px solid #e7e5e4",
                  background: i === 1 ? "rgba(27,67,50,0.08)" : "#fff",
                  color: i === 1 ? "#1b4332" : "#78716c",
                }}>
                  {label}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#78716c", marginBottom: 6, fontWeight: 700 }}>주제 입력</div>
            <div style={{ background: "#f7f5f3", border: "1px solid #e7e5e4", borderRadius: 12, padding: "12px 14px", fontSize: 14, color: "#1c1917", minHeight: 20 }}>
              {typedTopic}<span className="demo-caret">|</span>
            </div>
          </div>
        )}
        {stepIndex === 1 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#78716c", textTransform: "uppercase", letterSpacing: 0.5 }}>AI 실시간 미리보기</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1c1917", marginBottom: 10, minHeight: 20 }}>
              {typedTitle}
            </div>
            <div style={{ background: "#f7f5f3", border: "1px solid #e7e5e4", borderRadius: 12, padding: 18, fontSize: 13.5, color: "#57534e", lineHeight: 1.7, minHeight: 116 }}>
              {typedBody}<span className="demo-caret">|</span>
            </div>
          </div>
        )}
        {stepIndex === 2 && (
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <div style={{ width: 110, height: 110, borderRadius: 14, background: "#1b4332", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 34 }}>
              🖼️
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1c1917" }}>썸네일 생성 중...</div>
              <div style={{ fontSize: 13, color: "#a8a29e", marginTop: 4 }}>4가지 스타일 중 자동 선택 · Sharp 합성</div>
            </div>
          </div>
        )}
        {stepIndex === 3 && (
          <div>
            <button style={{ background: "#1b4332", color: "#fff", border: "none", borderRadius: 12, padding: "12px 28px", fontSize: 14, fontWeight: 700, marginBottom: 18, cursor: "default" }}>
              발행
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(27,67,50,0.08)", border: "1px solid rgba(27,67,50,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#1b4332", animation: "pulse 1.4s ease-in-out infinite" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1b4332" }}>네이버 발행 중 · {publishPct}%</span>
            </div>
            <div style={{ background: "rgba(27,67,50,0.15)", height: 6, borderRadius: 3 }}>
              <div style={{ height: "100%", width: `${publishPct}%`, background: "#1b4332", borderRadius: 3, transition: "width 0.1s linear" }} />
            </div>
          </div>
        )}
        {stepIndex === 4 && (
          <div style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 12, padding: "24px 26px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>검색 순위</div>
              <div style={{ fontSize: 34, fontWeight: 900, color: "#1c1917" }}>#7위</div>
              <div style={{ fontSize: 13, color: "#78716c", marginTop: 2 }}>강남 맛집 · 블로그 탭</div>
            </div>
            <span style={{ padding: "5px 14px", borderRadius: 20, background: "rgba(16,185,129,0.15)", color: "#10b981", fontSize: 13, fontWeight: 700 }}>▲ 12 상승</span>
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px solid #e7e5e4", padding: "16px 20px", display: "flex", gap: 8, alignItems: "flex-start", background: "#f7f5f3" }}>
        <span style={{ fontSize: 14, color: "#1b4332", flexShrink: 0 }}>▶</span>
        <span style={{ fontSize: 13.5, color: "#57534e", lineHeight: 1.6 }}>
          <strong style={{ color: "#1c1917" }}>STEP {step.num}.</strong> {step.desc}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, justifyContent: "center", padding: "10px 0 14px", background: "#f7f5f3" }}>
        {PROCESS_STEPS.map((_, i) => (
          <span
            key={i}
            onClick={() => onJump(i)}
            style={{
              width: i === stepIndex ? 16 : 6, height: 6, borderRadius: 3, cursor: "pointer",
              background: i === stepIndex ? "#1b4332" : "#d6d3d1", transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [demoElapsed, setDemoElapsed] = useState(0);
  const [heroTab, setHeroTab] = useState(0);
  const [heroElapsed, setHeroElapsed] = useState(0);
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 작동 방식 데모 패널 타임라인 진행
  // setInterval 누적(+60) 대신 시작 시각(Date.now()) 기준으로 현재 스텝을 매번 다시 계산한다.
  // 누적 방식은 혹시라도 타이머가 중복 등록되면(예: React StrictMode의 effect 이중 실행이
  // 정리되지 않는 경우) 스텝이 2씩 건너뛰는 버그가 생기는데, 절대시각 기준 계산은 몇 번을
  // 더 호출되든 항상 같은 값을 내놓으므로 그런 중복에 영향을 받지 않는다.
  const demoStartRef = useRef(Date.now());
  useEffect(() => {
    const cycleLen = DEMO_STEP_MS * PROCESS_STEPS.length;
    const tick = setInterval(() => {
      const pos = (Date.now() - demoStartRef.current) % cycleLen;
      setDemoStep(Math.floor(pos / DEMO_STEP_MS));
      setDemoElapsed(pos % DEMO_STEP_MS);
    }, 60);
    return () => clearInterval(tick);
  }, []);

  const jumpToStep = (i) => {
    demoStartRef.current = Date.now() - i * DEMO_STEP_MS;
    setDemoStep(i);
    setDemoElapsed(0);
  };

  // 히어로 데모 패널 타임라인 진행 (새 포스팅 → 황금 키워드 → 순위 분석 순환) — 동일하게 절대시각 기준.
  const heroStartRef = useRef(Date.now());
  useEffect(() => {
    const cycleLen = HERO_TAB_MS * HERO_TABS.length;
    const tick = setInterval(() => {
      const pos = (Date.now() - heroStartRef.current) % cycleLen;
      setHeroTab(Math.floor(pos / HERO_TAB_MS));
      setHeroElapsed(pos % HERO_TAB_MS);
    }, 60);
    return () => clearInterval(tick);
  }, []);

  const jumpHeroTab = (i) => {
    heroStartRef.current = Date.now() - i * HERO_TAB_MS;
    setHeroTab(i);
    setHeroElapsed(0);
  };

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const navBg = scrolled
    ? isDark ? "rgba(12,10,9,0.94)" : "rgba(255,255,255,0.94)"
    : "transparent";

  return (
    <div style={{ background: "var(--bg-primary)", color: "var(--text-primary)", overflowX: "hidden" }}>

      {/* ───── NAVBAR ───── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000,
        transition: "all 0.3s ease",
        background: navBg,
        backdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 10, height: 10, background: "#1b4332" }} />
            <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.5px" }}>BlogMaster AI</span>
          </div>

          <nav style={{ display: "flex", alignItems: "center", gap: 32 }} className="desktop-nav">
            {[["서비스 소개", "features"], ["작동 방식", "process"], ["기능 목록", "why"]].map(([label, id]) => (
              <button key={id} onClick={() => scrollTo(id)} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "color 0.2s", padding: 0 }}
                onMouseEnter={e => e.target.style.color = "var(--text-primary)"}
                onMouseLeave={e => e.target.style.color = "var(--text-secondary)"}>
                {label}
              </button>
            ))}
          </nav>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link href="/login" style={{ textDecoration: "none", background: "#1b4332", color: "#fff", fontSize: 14, fontWeight: 800, padding: "10px 22px" }}>
              로그인
            </Link>
            <button
              onClick={toggleTheme}
              title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                padding: '9px 13px',
                cursor: 'pointer',
                fontSize: 16,
                color: 'var(--text-secondary)',
              }}>
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      {/* ───── HERO (고정 다크 · 에디토리얼 스타일) ───── */}
      <section id="home" style={{
        background: "#0c0a09",
        color: "#f2f0ef",
        paddingTop: 68,
        position: "relative",
        overflow: "hidden",
        borderBottom: "6px solid #d8f3dc",
      }}>
        {/* 배경 텍스처 — 사진 대신 대각선 결의 세이지 그린 그라디언트 블록 */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 900px 500px at 85% 20%, rgba(216,243,220,0.18), transparent 60%), radial-gradient(ellipse 700px 500px at 10% 90%, rgba(216,243,220,0.1), transparent 60%)",
          pointerEvents: "none",
        }} />

        <div style={{
          maxWidth: 1320, margin: "0 auto", padding: "72px 24px 0",
          display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,560px)", gap: 48,
          alignItems: "center", position: "relative",
        }} className="hero-grid">
          {/* 왼쪽: 헤드라인 */}
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "6px 14px", background: "#d8f3dc", color: "#0c0a09", fontSize: 12, fontWeight: 800, letterSpacing: 1, marginBottom: 28 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#0c0a09" }} />
              AI 블로그 자동화 · 네이버 SEO 특화
            </div>

            <h1 style={{ fontSize: "clamp(38px, 5.2vw, 68px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-2px", marginBottom: 24 }}>
              AI가 쓰고,<br />
              <span style={{ color: "#d8f3dc" }}>자동으로 발행</span>합니다.
            </h1>

            <div style={{ width: 56, height: 3, background: "#d8f3dc", marginBottom: 24 }} />

            <p style={{ fontSize: "clamp(15px, 1.5vw, 18px)", color: "#a8a29e", lineHeight: 1.8, marginBottom: 40, maxWidth: 460 }}>
              주제만 입력하면 SEO 원고 생성부터 이미지 합성, 네이버 블로그 자동 발행,
              순위 추적까지 한 번에 끝냅니다.
            </p>

            <div style={{ display: "flex", gap: 0, flexWrap: "wrap", marginBottom: 56 }}>
              <Link href="/login" style={{ textDecoration: "none", background: "#d8f3dc", color: "#0c0a09", fontSize: 15, fontWeight: 800, padding: "16px 32px" }}>
                시작하기 →
              </Link>
            </div>

            <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
              {[["3분", "평균 원고 생성"], ["100%", "자동 발행 성공률"], ["TOP 10", "평균 검색 순위"]].map(([v, l], i) => (
                <div key={i}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: "#fff" }}>{v}</div>
                  <div style={{ fontSize: 12, color: "#78716c", marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 오른쪽: 실제 화면 재현 데모 패널 (새 포스팅 / 황금 키워드 / 순위 분석 순환) */}
          <HeroDemoPanel tabIndex={heroTab} elapsed={heroElapsed} onJump={jumpHeroTab} />
        </div>

        <div style={{ height: 64 }} />
      </section>

      {/* ───── FEATURES ───── */}
      <section id="features" style={{ padding: "100px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 56, borderLeft: "4px solid #1b4332", paddingLeft: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1b4332", letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>SERVICES</div>
            <h2 style={{ fontSize: "clamp(26px, 3.6vw, 44px)", fontWeight: 900, letterSpacing: "-1px" }}>
              블로그 운영의 모든 것을 자동화
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 1, background: "var(--border)", border: "1px solid var(--border)" }}>
            {[
              { icon: "✍️", tag: "Module 01", title: "AI 원고 자동 생성", desc: "Gemini AI가 SEO에 최적화된 블로그 원고를 작성합니다. 키워드 밀도, 문단 구조, 인용구 배치까지 자동으로.", points: ["키워드 분석 → 원고 자동 작성", "네이버 SEO 가이드라인 준수", "말투·톤 커스터마이징"], color: "#1b4332" },
              { icon: "🖼️", tag: "Module 02", title: "이미지·썸네일 자동 생성", desc: "본문에 어울리는 AI 이미지를 생성하고 썸네일에 텍스트를 자동으로 합성합니다.", points: ["Gemini 이미지 생성", "Sharp 썸네일 텍스트 합성", "4가지 썸네일 스타일 선택"], color: "#2d6a4f" },
              { icon: "🚀", tag: "Module 03", title: "네이버 블로그 자동 발행", desc: "Chrome 확장 프로그램이 네이버 스마트에디터를 직접 조작해 실제 발행합니다. 예약 발행, 카테고리, 공개 설정까지.", points: ["스마트에디터 자동 조작", "예약 발행 스케줄링", "멀티 계정 동시 운영"], color: "#40916c" },
              { icon: "📊", tag: "Module 04", title: "SEO 순위 실시간 추적", desc: "발행된 포스팅이 네이버 검색에서 몇 위인지 자동으로 체크하고 변화를 기록합니다.", points: ["상위 200위 내 자동 탐색", "일별 순위 변화 기록", "키워드별 직접 검색 분석"], color: "#10b981" },
              { icon: "🔑", tag: "Module 05", title: "황금 키워드 분석", desc: "경쟁도 낮고 조회수 높은 키워드를 자동으로 발굴합니다. 네이버 광고 API 기반 실데이터.", points: ["조회수·경쟁 자동 분석", "연관 키워드 발굴", "월간 검색량 기준 필터링"], color: "#f59e0b" },
              { icon: "⚡", tag: "Module 06", title: "Chrome 확장 프로그램 발행", desc: "서버 자동화 대신 내 PC 브라우저로 직접 발행. 네이버 캡차·봇 감지 없이 안전하게 발행합니다.", points: ["내 브라우저 직접 제어", "캡차 우회 없이 안전 발행", "실시간 발행 로그 확인"], color: "#ef4444" },
            ].map((f, i) => (
              <div key={i} style={{ padding: 28, background: "var(--bg-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 40, height: 40, background: f.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>
                    {f.icon}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: f.color, letterSpacing: 2, textTransform: "uppercase" }}>{f.tag}</span>
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>{f.title}</h3>
                <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>{f.desc}</p>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                  {f.points.map((pt, pi) => (
                    <li key={pi} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                      <span style={{ color: f.color, fontWeight: 900 }}>+</span> {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── PROCESS (단색 코랄 블록 + 시연 애니메이션) ───── */}
      <section id="process" style={{ padding: "100px 24px", background: "#d8f3dc" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ marginBottom: 56 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#0c0a09", letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>HOW IT WORKS</div>
            <h2 style={{ fontSize: "clamp(26px, 3.6vw, 44px)", fontWeight: 900, letterSpacing: "-1px", color: "#0c0a09" }}>
              주제 입력부터 발행까지 5단계
            </h2>
          </div>

          <div className="process-layout" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,560px)", gap: 48, alignItems: "start" }}>
            {/* 왼쪽: 단계 리스트 (오른쪽 데모와 동일한 타이머로 하이라이트 동기화) */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {PROCESS_STEPS.map((step, i) => {
                const active = i === demoStep;
                return (
                  <div
                    key={i}
                    onClick={() => jumpToStep(i)}
                    className="process-row"
                    style={{
                      display: "flex", gap: 28, alignItems: "flex-start", cursor: "pointer",
                      padding: "22px 20px", margin: "4px 0",
                      background: active ? "#fff" : "transparent",
                      borderBottom: !active && i < PROCESS_STEPS.length - 1 ? "1px solid rgba(12,10,9,0.2)" : "none",
                      transition: "background 0.25s ease",
                    }}
                  >
                    <div style={{ flexShrink: 0, fontSize: 15, fontWeight: 900, color: "#0c0a09", letterSpacing: 1, paddingTop: 2 }}>
                      {step.num}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: "#0c0a09" }}>{step.title}</h3>
                      <p style={{ fontSize: 14, color: "rgba(12,10,9,0.75)", lineHeight: 1.7 }}>{step.desc}</p>
                    </div>
                    <div style={{
                      flexShrink: 0, fontSize: 12, fontWeight: 800, alignSelf: "center", padding: "4px 12px",
                      color: active ? "#0c0a09" : "#fff", background: active ? "#d8f3dc" : "#0c0a09",
                    }}>
                      STEP {step.num}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 오른쪽: 시연 애니메이션 패널 */}
            <div className="process-demo-sticky">
              <ProcessDemoPanel stepIndex={demoStep} elapsed={demoElapsed} onJump={jumpToStep} />
            </div>
          </div>
        </div>
      </section>

      {/* ───── WHY ───── */}
      <section id="why" style={{ padding: "100px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ marginBottom: 56, borderLeft: "4px solid #1b4332", paddingLeft: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1b4332", letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>WHY BLOGMASTER</div>
            <h2 style={{ fontSize: "clamp(26px, 3.6vw, 44px)", fontWeight: 900, letterSpacing: "-1px" }}>
              다른 툴과의 차이
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 1, background: "var(--border)", border: "1px solid var(--border)" }}>
            {[
              { title: "네이버 전용 최적화", desc: "네이버 스마트에디터 구조와 SEO 가이드라인에 맞춰 원고와 태그를 자동으로 최적화합니다." },
              { title: "안전한 발행 방식", desc: "Chrome 확장 프로그램을 통해 내 PC에서 직접 발행. 캡차나 계정 제한 없이 안정적으로 운영합니다." },
              { title: "계정별 커스터마이징", desc: "계정마다 다른 말투, 프롬프트, 푸터 이미지, 사업자 정보를 개별 설정해 자동 적용합니다." },
              { title: "실제 순위 데이터", desc: "네이버 블로그 검색 API 기반으로 내 포스팅의 실제 노출 순위를 매일 자동으로 수집합니다." },
            ].map((w, i) => (
              <div key={i} style={{ padding: 28, background: "var(--bg-primary)" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#1b4332", marginBottom: 14 }}>0{i + 1}</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>{w.title}</h3>
                <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.7 }}>{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── CTA (고정 다크 블록) ───── */}
      <section style={{ padding: "100px 24px", background: "#0c0a09", borderTop: "6px solid #d8f3dc" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "6px 14px", background: "#10b981", color: "#0c0a09", fontSize: 12, fontWeight: 800, letterSpacing: 1, marginBottom: 28 }}>
            지금 바로 시작할 수 있습니다
          </div>
          <h2 style={{ fontSize: "clamp(26px, 3.8vw, 48px)", fontWeight: 900, letterSpacing: "-1.5px", lineHeight: 1.15, marginBottom: 20, color: "#fff" }}>
            블로그 운영을 <span style={{ color: "#d8f3dc" }}>AI에게</span> 맡기세요
          </h2>
          <p style={{ fontSize: 16, color: "#a8a29e", lineHeight: 1.8, marginBottom: 44 }}>
            반복적인 원고 작성, 이미지 제작, 발행 작업에서 벗어나<br />
            전략과 기획에만 집중할 수 있습니다.
          </p>
          <Link href="/login" style={{ textDecoration: "none", background: "#d8f3dc", color: "#0c0a09", fontSize: 16, fontWeight: 800, padding: "18px 44px", display: "inline-block" }}>
            로그인하고 시작하기 →
          </Link>
        </div>
      </section>

      {/* ───── FOOTER ───── */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "40px 24px", background: "var(--bg-primary)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>BlogMaster AI</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>AI 기반 네이버 블로그 자동화 플랫폼</div>
          </div>
          <div style={{ display: "flex", gap: 28 }}>
            {[["서비스 소개", "features"], ["작동 방식", "process"], ["기능 목록", "why"]].map(([label, id]) => (
              <button key={id} onClick={() => scrollTo(id)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 0, transition: "color 0.2s" }}
                onMouseEnter={e => e.target.style.color = "var(--text-primary)"}
                onMouseLeave={e => e.target.style.color = "var(--text-muted)"}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>© 2026 BlogMaster AI. All rights reserved.</div>
        </div>
      </footer>

      <style>{`
        .demo-caret {
          opacity: 1;
          animation: demoBlink 0.9s step-end infinite;
        }
        @keyframes demoBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @media (min-width: 769px) {
          .process-demo-sticky { position: sticky; top: 100px; }
        }
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .hero-grid { grid-template-columns: 1fr !important; }
          .process-layout { grid-template-columns: 1fr !important; }
          .process-demo-sticky { order: -1; margin-bottom: 32px; }
        }
        @media (max-width: 480px) {
          .process-row { flex-direction: column !important; gap: 12px !important; }
        }
      `}</style>
    </div>
  );
}
