"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/lib/ThemeProvider";

// ═══════════════════════════════════════════════════════════
// DEMO ANIMATION DATA & CONSTANTS (preserved from original)
// ═══════════════════════════════════════════════════════════

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

const POST_MOCK_W = 1000;
const POST_VIEWPORT_W = 520;
const POST_VIEWPORT_H = 390;

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

function PostFullPageMock({ typedTopic }) {
  return (
    <div style={{ width: POST_MOCK_W, background: "#f7f5f3" }}>
      <MockTopNav active={2} />
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#1c1917" }}>새 포스팅 워크스페이스</div>
        <div style={{ fontSize: 12, color: "#a8a29e", marginTop: 4, marginBottom: 20 }}>AI와 실시간으로 소통하며 완벽한 네이버 블로그 포스팅을 완성하세요.</div>
      </div>
      <div style={{ display: "flex", gap: 20, padding: "0 20px 20px", alignItems: "flex-start" }}>
        <div style={{ width: 420, flexShrink: 0 }}>
          <MiniCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#78716c", marginBottom: 8 }}>네이버 계정</div>
            <div style={{ background: "#f7f5f3", border: "1px solid #e7e5e4", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#1c1917" }}>ss7649ss@naver.com (미술)</div>
          </MiniCard>
          <MiniCard>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#78716c", marginBottom: 10 }}>글 말투</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 12 }}>
              {[["😊","친근한"],["💕","여성적"],["💪","남성적"],["😎","일상체"],["📋","건강"]].map(([emoji,label],i)=>(
                <div key={label} style={{ textAlign:"center",padding:"8px 2px",borderRadius:10,fontSize:9,border:i===0?"1.5px solid #1b4332":"1px solid #e7e5e4",background:i===0?"rgba(27,67,50,0.08)":"#fff",color:i===0?"#1b4332":"#78716c",fontWeight:700 }}>
                  <div style={{ fontSize: 15 }}>{emoji}</div>{label}
                </div>
              ))}
            </div>
            <div style={{ background:"rgba(27,67,50,0.06)",border:"1px solid rgba(27,67,50,0.25)",borderRadius:10,padding:12,fontSize:11,color:"#57534e",lineHeight:1.7 }}>
              오늘은 제가 직접 다녀온 곳을 소개해 드릴게요 😊<br/>솔직히 처음엔 별 기대 안 했는데, 가보니까 진짜 너무 좋더라고요.
            </div>
          </MiniCard>
          <MiniCard>
            <div style={{ fontSize:11,fontWeight:700,color:"#78716c",marginBottom:10 }}>컨텐츠 생성 방식</div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6 }}>
              {["AI 추천","직접 입력","이미지 참조"].map((label,i)=>(
                <div key={label} style={{ textAlign:"center",padding:"10px 4px",borderRadius:10,fontSize:10.5,fontWeight:700,border:i===1?"1.5px solid #1b4332":"1px solid #e7e5e4",background:i===1?"rgba(27,67,50,0.08)":"#fff",color:i===1?"#1b4332":"#78716c" }}>{label}</div>
              ))}
            </div>
          </MiniCard>
          <MiniCard>
            <div style={{ fontSize:11,fontWeight:700,color:"#78716c",marginBottom:10 }}>주제가 되는 내용</div>
            <div style={{ background:"#f7f5f3",border:"1.5px solid #1b4332",borderRadius:10,padding:"10px 12px",fontSize:13,color:"#1c1917",minHeight:20,marginBottom:10 }}>{typedTopic}<span className="demo-caret">|</span></div>
            <div style={{ fontSize:10.5,fontWeight:700,color:"#78716c",marginBottom:6 }}>작성 세부 요청사항 (선택)</div>
            <div style={{ background:"#f7f5f3",border:"1px solid #e7e5e4",borderRadius:10,padding:"10px 12px",fontSize:11,color:"#c4c1bf" }}>예: 가족여행이니 접근성이 좋다는 내용을 꼭 넣어주세요.</div>
          </MiniCard>
          <MiniCard>
            <div style={{ fontSize:11,fontWeight:700,color:"#78716c",marginBottom:10 }}>언제 발행할까요?</div>
            <div style={{ display:"flex",gap:8 }}>
              <div style={{ flex:1,textAlign:"center",padding:"10px",borderRadius:10,background:"#1b4332",color:"#fff",fontSize:12,fontWeight:700 }}>⚡ 즉시 발행</div>
              <div style={{ flex:1,textAlign:"center",padding:"10px",borderRadius:10,border:"1px solid #e7e5e4",color:"#78716c",fontSize:12,fontWeight:700 }}>🕐 예약 발행</div>
            </div>
          </MiniCard>
          <MiniCard style={{ marginBottom:0 }}>
            <div style={{ display:"flex",gap:8 }}>
              <span style={{ flex:1,textAlign:"center",padding:"12px",borderRadius:10,border:"1px solid #e7e5e4",fontSize:13,fontWeight:700,color:"#78716c" }}>원고 생성</span>
              <span style={{ flex:1,textAlign:"center",padding:"12px",borderRadius:10,background:"#1b4332",fontSize:13,fontWeight:700,color:"#fff" }}>발행</span>
            </div>
          </MiniCard>
        </div>
        <div style={{ flex:1,background:"#fff",border:"1px solid #e7e5e4",borderRadius:16,padding:20,alignSelf:"stretch" }}>
          <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:14 }}>
            <span style={{ width:8,height:8,borderRadius:"50%",background:"#10b981" }}/>
            <span style={{ fontSize:12,fontWeight:700,color:"#78716c",textTransform:"uppercase" }}>AI 실시간 미리보기</span>
          </div>
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:300,color:"#d6d3d1" }}>
            <div style={{ fontSize:40,marginBottom:12 }}>🖋️</div>
            <div style={{ fontSize:12,textAlign:"center" }}>왼쪽 양식을 작성하고<br/><strong>&apos;원고 생성&apos;</strong> 버튼을 클릭하세요.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PostCameraDemo({ elapsed }) {
  return (<CameraDemo shots={POST_SHOTS} shotMs={POST_SHOT_MS} elapsed={elapsed} renderMock={(shotIdx,shotElapsed)=>{
    const typedTopic = shotIdx >= 2 ? DEMO_TOPIC.slice(0,Math.floor(shotElapsed/85)) : "";
    return <PostFullPageMock typedTopic={typedTopic}/>;
  }}/>);
}

const KEYWORDS_SHOTS = [
  { label:"황금키워드 정밀 분석",scale:0.42,focusX:500,focusY:260 },
  { label:"대표 키워드를 입력하면 실시간으로 분석합니다",scale:0.8,focusX:150,focusY:188 },
  { label:"등급·검색량·발행량·포화지수까지 한눈에",scale:0.8,focusX:400,focusY:291 },
  { label:"최근 12개월 검색 추이를 그래프로 한눈에",scale:0.62,focusX:330,focusY:409 },
];
const KEYWORDS_SHOT_MS = HERO_TAB_MS / KEYWORDS_SHOTS.length;

function KeywordsFullPageMock({ typedKeyword }) {
  const stats = [{label:"키워드 등급",value:"S",color:"#f59e0b"},{label:"월간 검색량",value:"49,500"},{label:"월간 발행량",value:"1,204"},{label:"포화 지수",value:"낮음",color:"#10b981"},{label:"예상 검색량",value:"52.1만"}];
  return (
    <div style={{ width:POST_MOCK_W,background:"#f7f5f3" }}>
      <MockTopNav active={3}/>
      <div style={{ padding:"20px 20px 0" }}>
        <div style={{ fontSize:22,fontWeight:900,color:"#1c1917" }}>황금키워드 정밀 분석</div>
        <div style={{ fontSize:12,color:"#a8a29e",marginTop:4,marginBottom:20 }}>네이버 빅데이터를 분석하여 최적의 블로그 공략 전략을 제안합니다.</div>
      </div>
      <div style={{ padding:"0 20px 20px" }}>
        <MiniCard>
          <div style={{ display:"flex",gap:10 }}>
            <div style={{ flex:1,position:"relative" }}>
              <span style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:"#a8a29e" }}>🔍</span>
              <div style={{ background:"#f7f5f3",border:"1px solid #e7e5e4",borderRadius:10,padding:"12px 14px 12px 38px",fontSize:13,color:"#1c1917" }}>{typedKeyword}<span className="demo-caret">|</span></div>
            </div>
            <div style={{ padding:"0 20px",borderRadius:10,background:"#1b4332",color:"#fff",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",whiteSpace:"nowrap" }}>실시간 정밀 분석</div>
          </div>
        </MiniCard>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:14 }}>
          {stats.map(s=>(<div key={s.label} style={{ background:"#fff",border:"1px solid #e7e5e4",borderRadius:12,padding:"14px 8px",textAlign:"center" }}>
            <div style={{ fontSize:9.5,color:"#a8a29e",fontWeight:700,marginBottom:6 }}>{s.label}</div>
            <div style={{ fontSize:16,fontWeight:900,color:s.color||"#1c1917" }}>{s.value}</div>
          </div>))}
        </div>
        <div style={{ display:"flex",gap:14 }}>
          <MiniCard style={{ flex:2,marginBottom:0 }}>
            <div style={{ fontSize:12,fontWeight:700,color:"#78716c",marginBottom:10 }}>최근 12개월 추이</div>
            <div style={{ height:90,display:"flex",alignItems:"flex-end",gap:4 }}>
              {[40,55,45,70,60,80,65,90,75,85,95,88].map((h,i)=>(<div key={i} style={{ flex:1,height:`${h}%`,background:i===10?"#1b4332":"#d8f3dc",borderRadius:"2px 2px 0 0" }}/>))}
            </div>
          </MiniCard>
          <MiniCard style={{ flex:1,marginBottom:0 }}>
            <div style={{ fontSize:12,fontWeight:700,color:"#78716c",marginBottom:10 }}>인기 주제</div>
            <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
              {["강남 맛집 추천","강남역 데이트","강남 브런치"].map(t=>(<div key={t} style={{ fontSize:10.5,padding:"6px 8px",background:"#f7f5f3",borderRadius:8,color:"#57534e" }}>{t}</div>))}
            </div>
          </MiniCard>
        </div>
      </div>
    </div>
  );
}

function KeywordsCameraDemo({ elapsed }) {
  return (<CameraDemo shots={KEYWORDS_SHOTS} shotMs={KEYWORDS_SHOT_MS} elapsed={elapsed} renderMock={(shotIdx,shotElapsed)=>{
    const typedKeyword = shotIdx >= 1 ? "강남 맛집".slice(0,Math.floor(shotElapsed/110)) : "";
    return <KeywordsFullPageMock typedKeyword={typedKeyword}/>;
  }}/>);
}

const ANALYTICS_SHOTS = [
  { label:"순위 분석",scale:0.42,focusX:500,focusY:260 },
  { label:"키워드를 입력하면 내 게시글 순위를 확인합니다",scale:0.8,focusX:150,focusY:174 },
  { label:"네이버 검색 API 기준 1위~200위까지 자동 탐색",scale:0.7,focusX:260,focusY:231 },
  { label:"게시글별 실제 검색 순위를 한눈에",scale:0.8,focusX:920,focusY:300 },
];
const ANALYTICS_SHOT_MS = HERO_TAB_MS / ANALYTICS_SHOTS.length;

function AnalyticsResultCard({ title, rank }) {
  return (
    <div style={{ background:"#fff",border:"1px solid #e7e5e4",borderRadius:12,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
      <div style={{ minWidth:0,flex:1 }}>
        <div style={{ fontSize:12.5,fontWeight:700,color:"#1c1917",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{title}</div>
        <div style={{ fontSize:10.5,color:"#a8a29e",marginTop:5,display:"flex",alignItems:"center",gap:5 }}>
          <span style={{ background:"#d8f3dc",color:"#1b4332",padding:"1px 7px",borderRadius:20,fontWeight:700 }}>@myblog</span>2026.03.14
        </div>
      </div>
      <div style={{ textAlign:"right",flexShrink:0,marginLeft:12 }}>
        <div style={{ fontSize:20,fontWeight:900,color:"#10b981" }}>#{rank}위</div>
        <div style={{ fontSize:9.5,color:"#a8a29e" }}>{Math.ceil(rank/10)}p</div>
      </div>
    </div>
  );
}

function AnalyticsFullPageMock({ typedKeyword }) {
  return (
    <div style={{ width:POST_MOCK_W,background:"#f7f5f3" }}>
      <MockTopNav active={4}/>
      <div style={{ padding:"20px 20px 0" }}>
        <div style={{ fontSize:22,fontWeight:900,color:"#1c1917" }}>순위 분석</div>
        <div style={{ fontSize:12,color:"#a8a29e",marginTop:4,marginBottom:20 }}>키워드를 입력하면 내 블로그 게시글이 몇 위인지 확인할 수 있습니다.</div>
      </div>
      <div style={{ padding:"0 20px 20px" }}>
        <div style={{ display:"flex",gap:10,marginBottom:16 }}>
          <div style={{ flex:1,background:"#fff",border:"1px solid #e7e5e4",borderRadius:10,padding:"12px 14px",fontSize:13,color:"#1c1917" }}>{typedKeyword}<span className="demo-caret">|</span></div>
          <div style={{ padding:"0 20px",borderRadius:10,background:"#1b4332",color:"#fff",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",whiteSpace:"nowrap" }}>순위 검색</div>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:6,background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:10,padding:"9px 12px",fontSize:11,color:"#f59e0b",fontWeight:600,marginBottom:16 }}>⚠️ 네이버 검색 API 기준으로 조회된 결과입니다</div>
        <AnalyticsResultCard title="강남 맛집 찐맛집 리스트 총정리" rank={7}/>
        <AnalyticsResultCard title="강남역 데이트 코스 베스트 5" rank={23}/>
        <AnalyticsResultCard title="강남 브런치 카페 추천" rank={41}/>
      </div>
    </div>
  );
}

function AnalyticsCameraDemo({ elapsed }) {
  return (<CameraDemo shots={ANALYTICS_SHOTS} shotMs={ANALYTICS_SHOT_MS} elapsed={elapsed} renderMock={(shotIdx,shotElapsed)=>{
    const typedKeyword = shotIdx >= 1 ? "강남 맛집".slice(0,Math.floor(shotElapsed/110)) : "";
    return <AnalyticsFullPageMock typedKeyword={typedKeyword}/>;
  }}/>);
}

function HeroDemoPanel({ tabIndex, elapsed, onJump }) {
  const tab = HERO_TABS[tabIndex];
  return (
    <div style={{ background:"#fff",borderRadius:20,overflow:"hidden",boxShadow:"0 25px 60px rgba(0,0,0,0.3)" }}>
      <div style={{ padding:20,minHeight:320,background:"#fff",overflow:"hidden" }}>
        {tab.key === "post" && <PostCameraDemo elapsed={elapsed}/>}
        {tab.key === "keywords" && <KeywordsCameraDemo elapsed={elapsed}/>}
        {tab.key === "analytics" && <AnalyticsCameraDemo elapsed={elapsed}/>}
      </div>
      <div style={{ display:"flex",gap:6,padding:"12px 14px",background:"#f7f5f3",borderTop:"1px solid #e7e5e4" }}>
        {HERO_TABS.map((t,i)=>(
          <button key={t.key} onClick={()=>onJump(i)} style={{ flex:1,padding:"7px 4px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",border:i===tabIndex?"1.5px solid #1b4332":"1px solid #e7e5e4",background:i===tabIndex?"rgba(27,67,50,0.08)":"#fff",color:i===tabIndex?"#1b4332":"#78716c",transition:"all 0.2s ease" }}>{t.label}</button>
        ))}
      </div>
    </div>
  );
}

function ProcessDemoPanel({ stepIndex, elapsed, onJump }) {
  const step = PROCESS_STEPS[stepIndex];
  const typedTopic = DEMO_TOPIC.slice(0,Math.floor(elapsed/90));
  const typedTitle = DEMO_TITLE.slice(0,Math.floor(elapsed/55));
  const typedBody = DEMO_BODY.slice(0,Math.floor(elapsed/22));
  const publishPct = Math.min(100,Math.round((elapsed/(DEMO_STEP_MS-200))*100));
  return (
    <div style={{ background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.08)" }}>
      <div style={{ padding:28,minHeight:320,display:"flex",flexDirection:"column",justifyContent:"center",background:"#fff" }}>
        {stepIndex===0&&(<div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16 }}>
            {["AI 추천","직접 입력","이미지 참조"].map((label,i)=>(<div key={label} style={{ textAlign:"center",padding:"10px 6px",borderRadius:10,fontSize:11,fontWeight:700,border:i===1?"1.5px solid #1b4332":"1px solid #e7e5e4",background:i===1?"rgba(27,67,50,0.08)":"#fff",color:i===1?"#1b4332":"#78716c" }}>{label}</div>))}
          </div>
          <div style={{ fontSize:11,color:"#78716c",marginBottom:6,fontWeight:700 }}>주제 입력</div>
          <div style={{ background:"#f7f5f3",border:"1px solid #e7e5e4",borderRadius:12,padding:"12px 14px",fontSize:14,color:"#1c1917",minHeight:20 }}>{typedTopic}<span className="demo-caret">|</span></div>
        </div>)}
        {stepIndex===1&&(<div>
          <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:10 }}>
            <span style={{ width:8,height:8,borderRadius:"50%",background:"#10b981" }}/>
            <span style={{ fontSize:11,fontWeight:700,color:"#78716c",textTransform:"uppercase",letterSpacing:0.5 }}>AI 실시간 미리보기</span>
          </div>
          <div style={{ fontSize:15,fontWeight:800,color:"#1c1917",marginBottom:10,minHeight:20 }}>{typedTitle}</div>
          <div style={{ background:"#f7f5f3",border:"1px solid #e7e5e4",borderRadius:12,padding:18,fontSize:13.5,color:"#57534e",lineHeight:1.7,minHeight:116 }}>{typedBody}<span className="demo-caret">|</span></div>
        </div>)}
        {stepIndex===2&&(<div style={{ display:"flex",gap:20,alignItems:"center" }}>
          <div style={{ width:110,height:110,borderRadius:14,background:"#1b4332",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:34 }}>🖼️</div>
          <div><div style={{ fontSize:15,fontWeight:700,color:"#1c1917" }}>썸네일 생성 중...</div><div style={{ fontSize:13,color:"#a8a29e",marginTop:4 }}>4가지 스타일 중 자동 선택 · Sharp 합성</div></div>
        </div>)}
        {stepIndex===3&&(<div>
          <button style={{ background:"#1b4332",color:"#fff",border:"none",borderRadius:12,padding:"12px 28px",fontSize:14,fontWeight:700,marginBottom:18,cursor:"default" }}>발행</button>
          <div style={{ display:"flex",alignItems:"center",gap:8,background:"rgba(27,67,50,0.08)",border:"1px solid rgba(27,67,50,0.3)",borderRadius:10,padding:"10px 14px",marginBottom:8 }}>
            <span style={{ width:7,height:7,borderRadius:"50%",background:"#1b4332",animation:"pulse 1.4s ease-in-out infinite" }}/>
            <span style={{ fontSize:12,fontWeight:700,color:"#1b4332" }}>네이버 발행 중 · {publishPct}%</span>
          </div>
          <div style={{ background:"rgba(27,67,50,0.15)",height:6,borderRadius:3 }}><div style={{ height:"100%",width:`${publishPct}%`,background:"#1b4332",borderRadius:3,transition:"width 0.1s linear" }}/></div>
        </div>)}
        {stepIndex===4&&(<div style={{ background:"#fff",border:"1px solid #e7e5e4",borderRadius:12,padding:"24px 26px",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div><div style={{ fontSize:12,fontWeight:700,color:"#a8a29e",textTransform:"uppercase",letterSpacing:0.5 }}>검색 순위</div><div style={{ fontSize:34,fontWeight:900,color:"#1c1917" }}>#7위</div><div style={{ fontSize:13,color:"#78716c",marginTop:2 }}>강남 맛집 · 블로그 탭</div></div>
          <span style={{ padding:"5px 14px",borderRadius:20,background:"rgba(16,185,129,0.15)",color:"#10b981",fontSize:13,fontWeight:700 }}>▲ 12 상승</span>
        </div>)}
      </div>
      <div style={{ borderTop:"1px solid #e7e5e4",padding:"16px 20px",display:"flex",gap:8,alignItems:"flex-start",background:"#f7f5f3" }}>
        <span style={{ fontSize:14,color:"#1b4332",flexShrink:0 }}>▶</span>
        <span style={{ fontSize:13.5,color:"#57534e",lineHeight:1.6 }}><strong style={{ color:"#1c1917" }}>STEP {step.num}.</strong> {step.desc}</span>
      </div>
      <div style={{ display:"flex",gap:6,justifyContent:"center",padding:"10px 0 14px",background:"#f7f5f3" }}>
        {PROCESS_STEPS.map((_,i)=>(<span key={i} onClick={()=>onJump(i)} style={{ width:i===stepIndex?16:6,height:6,borderRadius:3,cursor:"pointer",background:i===stepIndex?"#1b4332":"#d6d3d1",transition:"all 0.3s ease" }}/>))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ANIMATED COUNTER
// ═══════════════════════════════════════════════════════════
function AnimatedCounter({ end, suffix = "", duration = 2000 }) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && !started) setStarted(true); }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started]);
  useEffect(() => {
    if (!started) return;
    const startTime = Date.now();
    const tick = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startTime) / duration);
      setCount(Math.round((1 - Math.pow(1 - progress, 3)) * end));
      if (progress >= 1) clearInterval(tick);
    }, 16);
    return () => clearInterval(tick);
  }, [started, end, duration]);
  return <span ref={ref}>{count}{suffix}</span>;
}

// ═══════════════════════════════════════════════════════════
// MAIN HOME PAGE
// ═══════════════════════════════════════════════════════════
export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [demoElapsed, setDemoElapsed] = useState(0);
  const [heroTab, setHeroTab] = useState(0);
  const [heroElapsed, setHeroElapsed] = useState(0);
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => { const h = () => setScrolled(window.scrollY > 40); window.addEventListener("scroll", h); return () => window.removeEventListener("scroll", h); }, []);

  const demoStartRef = useRef(0);
  useEffect(() => {
    demoStartRef.current = Date.now();
    const c = DEMO_STEP_MS * PROCESS_STEPS.length;
    const t = setInterval(() => { const p = (Date.now()-demoStartRef.current)%c; setDemoStep(Math.floor(p/DEMO_STEP_MS)); setDemoElapsed(p%DEMO_STEP_MS); }, 60);
    return () => clearInterval(t);
  }, []);
  const jumpToStep = (i) => { demoStartRef.current = Date.now() - i*DEMO_STEP_MS; setDemoStep(i); setDemoElapsed(0); };

  const heroStartRef = useRef(0);
  useEffect(() => {
    heroStartRef.current = Date.now();
    const c = HERO_TAB_MS * HERO_TABS.length;
    const t = setInterval(() => { const p = (Date.now()-heroStartRef.current)%c; setHeroTab(Math.floor(p/HERO_TAB_MS)); setHeroElapsed(p%HERO_TAB_MS); }, 60);
    return () => clearInterval(t);
  }, []);
  const jumpHeroTab = (i) => { heroStartRef.current = Date.now() - i*HERO_TAB_MS; setHeroTab(i); setHeroElapsed(0); };

  const scrollTo = (id) => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); };

  const navBg = scrolled ? (isDark ? "rgba(12,10,9,0.94)" : "rgba(255,255,255,0.94)") : "transparent";

  return (
    <div style={{ background:"var(--bg-primary)",color:"var(--text-primary)",overflowX:"hidden" }}>

      {/* NAVBAR */}
      <header style={{ position:"fixed",top:0,left:0,right:0,zIndex:1000,transition:"all 0.3s ease",background:navBg,backdropFilter:scrolled?"blur(16px)":"none",borderBottom:scrolled?"1px solid var(--border)":"1px solid transparent" }}>
        <div style={{ maxWidth:1200,margin:"0 auto",padding:"0 24px",height:68,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <span style={{ width:10,height:10,background:"#1b4332",borderRadius:2 }}/>
            <span style={{ fontSize:18,fontWeight:900,letterSpacing:"-0.5px" }}>BlogMaster AI</span>
          </div>
          <nav style={{ display:"flex",alignItems:"center",gap:32 }} className="desktop-nav">
            {[["서비스 소개","features"],["비교","compare"],["가격","pricing"],["작동 방식","process"]].map(([label,id])=>(
              <button key={id} onClick={()=>scrollTo(id)} style={{ background:"none",border:"none",color:"var(--text-secondary)",fontSize:14,fontWeight:700,cursor:"pointer",transition:"color 0.2s",padding:0 }}
                onMouseEnter={e=>e.target.style.color="var(--text-primary)"} onMouseLeave={e=>e.target.style.color="var(--text-secondary)"}>{label}</button>
            ))}
          </nav>
          <div style={{ display:"flex",gap:10,alignItems:"center" }}>
            <Link href="/login" style={{ textDecoration:"none",background:"#1b4332",color:"#fff",fontSize:14,fontWeight:800,padding:"10px 22px",borderRadius:10 }}>로그인</Link>
            <button onClick={toggleTheme} title={isDark?'라이트 모드로 전환':'다크 모드로 전환'} style={{ background:'transparent',border:'1px solid var(--border)',borderRadius:10,padding:'9px 13px',cursor:'pointer',fontSize:16,color:'var(--text-secondary)' }}>{isDark?'☀️':'🌙'}</button>
          </div>
        </div>
      </header>

      {/* ═══ HERO ═══ */}
      <section id="home" style={{ background:"#0c0a09",color:"#f2f0ef",paddingTop:68,position:"relative",overflow:"hidden" }}>
        <div style={{ position:"absolute",inset:0,background:"radial-gradient(ellipse 800px 600px at 75% 30%, rgba(27,67,50,0.3), transparent 60%), radial-gradient(ellipse 600px 400px at 15% 80%, rgba(16,185,129,0.12), transparent 60%)",pointerEvents:"none" }}/>
        <div style={{ position:"absolute",inset:0,opacity:0.04,backgroundImage:"linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",backgroundSize:"60px 60px",pointerEvents:"none" }}/>

        <div style={{ maxWidth:1320,margin:"0 auto",padding:"80px 24px 0",display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,560px)",gap:48,alignItems:"center",position:"relative" }} className="hero-grid">
          <div>
            <div style={{ display:"inline-flex",alignItems:"center",gap:10,padding:"8px 18px",background:"rgba(27,67,50,0.4)",border:"1px solid rgba(45,106,79,0.5)",backdropFilter:"blur(8px)",color:"#d8f3dc",fontSize:13,fontWeight:700,letterSpacing:0.5,marginBottom:32,borderRadius:100 }}>
              <span style={{ width:8,height:8,borderRadius:"50%",background:"#10b981",animation:"pulse 2s ease-in-out infinite" }}/> 네이버 블로그 자동화 플랫폼
            </div>
            <h1 style={{ fontSize:"clamp(36px,5vw,64px)",fontWeight:900,lineHeight:1.1,letterSpacing:"-2px",marginBottom:24 }}>
              주제 하나만 입력하세요.<br/><span style={{ background:"linear-gradient(135deg, #d8f3dc, #10b981)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>나머지는 AI가 전부</span> 합니다.
            </h1>
            <p style={{ fontSize:"clamp(15px,1.4vw,18px)",color:"#a8a29e",lineHeight:1.9,marginBottom:20,maxWidth:480 }}>
              SEO 최적화 원고 생성 → AI 이미지 합성 → 네이버 블로그 자동 발행 → 검색 순위 추적까지.<br/>블로그 운영의 모든 과정을 하나의 대시보드에서 끝내세요.
            </p>
            <p style={{ fontSize:14,color:"#78716c",marginBottom:40,maxWidth:480 }}>
              하루 3~4시간 걸리던 블로그 운영을 <strong style={{ color:"#10b981" }}>3분</strong>으로 단축합니다.
            </p>
            <div style={{ display:"flex",gap:12,flexWrap:"wrap",marginBottom:56 }}>
              <Link href="/signup" className="hero-cta-primary" style={{ textDecoration:"none",background:"linear-gradient(135deg, #1b4332, #2d6a4f)",color:"#fff",fontSize:16,fontWeight:800,padding:"16px 36px",borderRadius:14,boxShadow:"0 4px 24px rgba(27,67,50,0.4)",transition:"transform 0.2s, box-shadow 0.2s" }}>무료체험하기 →</Link>
              <button onClick={()=>scrollTo("process")} style={{ background:"transparent",border:"1px solid rgba(255,255,255,0.2)",color:"#d6d3d1",fontSize:16,fontWeight:700,padding:"16px 32px",borderRadius:14,cursor:"pointer",transition:"all 0.2s" }}>작동 방식 보기</button>
            </div>
            <div style={{ display:"flex",gap:48,flexWrap:"wrap" }}>
              {[[<AnimatedCounter key="c1" end={3} suffix="분"/>,"평균 원고 생성"],[<AnimatedCounter key="c2" end={100} suffix="%"/>,"자동 발행 성공률"],["TOP 10","평균 검색 순위"]].map(([v,l],i)=>(
                <div key={i}><div style={{ fontSize:28,fontWeight:900,color:"#fff" }}>{v}</div><div style={{ fontSize:12,color:"#78716c",marginTop:4 }}>{l}</div></div>
              ))}
            </div>
          </div>
          <HeroDemoPanel tabIndex={heroTab} elapsed={heroElapsed} onJump={jumpHeroTab}/>
        </div>
        <div style={{ height:80 }}/>
        <div style={{ position:"relative",height:64 }}>
          <svg viewBox="0 0 1440 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position:"absolute",bottom:0,width:"100%",height:64 }}>
            <path d="M0 32C240 64 480 0 720 32C960 64 1200 0 1440 32V64H0V32Z" fill="var(--bg-primary)"/>
          </svg>
        </div>
      </section>

      {/* ═══ PAIN POINT ═══ */}
      <section style={{ padding:"80px 24px 0" }}>
        <div style={{ maxWidth:920,margin:"0 auto",textAlign:"center" }}>
          <div style={{ fontSize:13,fontWeight:800,color:"var(--accent)",letterSpacing:2,textTransform:"uppercase",marginBottom:16 }}>이런 고민, 있으시죠?</div>
          <h2 style={{ fontSize:"clamp(24px,3.2vw,38px)",fontWeight:900,letterSpacing:"-1px",lineHeight:1.3,marginBottom:16 }}>
            블로그 포스팅 1개 쓰는데<br/>무려 <span style={{ color:"#ef4444" }}>3시간 20분</span>이 사라집니다
          </h2>
          <p style={{ fontSize:15,color:"var(--text-secondary)",marginBottom:40 }}>
            원고 작성부터 썸네일 제작, 발행, 순위 체크까지... 매일 반복되는 수동 작업의 시간 부담
          </p>

          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:16,marginBottom:32 }}>
            {[
              { step:"01", icon:"🔍", title:"키워드 탐색", time:"30분", desc:"경쟁도·조회수 수동 분석" },
              { step:"02", icon:"✍️", title:"SEO 원고 작성", time:"90분", desc:"구조 잡고 본문 4,000자 작성" },
              { step:"03", icon:"🖼️", title:"이미지·썸네일", time:"40분", desc:"이미지 찾고 포토샵 편집" },
              { step:"04", icon:"🚀", title:"네이버 수동 발행", time:"20분", desc:"복사-붙여넣기 및 스마트에디터" },
              { step:"05", icon:"📊", title:"검색 순위 추적", time:"20분", desc:"매일 직접 검색해서 확인" },
            ].map((item,i)=>(
              <div key={i} className="pain-card" style={{ padding:"24px 16px",borderRadius:16,background:"var(--bg-secondary)",border:"1px solid var(--border)",textAlign:"center",transition:"transform 0.2s ease, box-shadow 0.2s ease" }}>
                <div style={{ fontSize:11,fontWeight:800,color:"var(--text-muted)",marginBottom:6 }}>STEP {item.step}</div>
                <div style={{ fontSize:28,marginBottom:8 }}>{item.icon}</div>
                <div style={{ fontSize:14,fontWeight:800,color:"var(--text-primary)",marginBottom:4 }}>{item.title}</div>
                <div style={{ fontSize:16,fontWeight:900,color:"#ef4444",marginBottom:6 }}>{item.time}</div>
                <div style={{ fontSize:11.5,color:"var(--text-muted)",lineHeight:1.4 }}>{item.desc}</div>
              </div>
            ))}
          </div>

          {/* 소요 시간 비교 하이라이트 바 */}
          <div style={{ background:"linear-gradient(135deg, rgba(27,67,50,0.08), rgba(16,185,129,0.12))",border:"1.5px solid rgba(27,67,50,0.25)",borderRadius:20,padding:"24px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16 }}>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontSize:13,fontWeight:700,color:"var(--text-secondary)",marginBottom:4 }}>기존 수동 작업 소요 시간</div>
              <div style={{ fontSize:22,fontWeight:900,color:"#ef4444",textDecoration:"line-through" }}>총 200분 (3시간 20분)</div>
            </div>
            <div style={{ fontSize:28,fontWeight:900,color:"var(--accent)" }}>➔</div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:13,fontWeight:800,color:"#10b981",marginBottom:4 }}>BlogMaster AI 자동화</div>
              <div style={{ fontSize:28,fontWeight:900,color:"#10b981" }}>단 3분 만에 완료!⚡</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ COMPARE 1: 직접 발행 vs BlogMaster AI ═══ */}
      <section id="compare" style={{ padding:"100px 24px" }}>
        <div style={{ maxWidth:960,margin:"0 auto" }}>
          <div style={{ textAlign:"center",marginBottom:56 }}>
            <div style={{ fontSize:13,fontWeight:800,color:"var(--accent)",letterSpacing:2,textTransform:"uppercase",marginBottom:12 }}>COMPARISON</div>
            <h2 style={{ fontSize:"clamp(24px,3.2vw,40px)",fontWeight:900,letterSpacing:"-1px" }}>직접 운영 vs BlogMaster AI</h2>
            <p style={{ fontSize:15,color:"var(--text-secondary)",marginTop:12,maxWidth:500,margin:"12px auto 0" }}>같은 결과물, 압도적인 시간 차이</p>
          </div>
          <div style={{ borderRadius:20,overflow:"hidden",border:"1px solid var(--border)",boxShadow:"var(--shadow-md)" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:14 }}>
              <thead><tr>
                <th style={{ padding:"18px 20px",textAlign:"left",background:"var(--bg-secondary)",borderBottom:"1px solid var(--border)",fontSize:13,fontWeight:800,color:"var(--text-muted)",width:"30%" }}>항목</th>
                <th style={{ padding:"18px 20px",textAlign:"center",background:"var(--bg-secondary)",borderBottom:"1px solid var(--border)",fontSize:13,fontWeight:800,color:"var(--text-muted)",width:"35%" }}>직접 발행 ✍️</th>
                <th style={{ padding:"18px 20px",textAlign:"center",background:"rgba(27,67,50,0.08)",borderBottom:"1px solid var(--border)",fontSize:13,fontWeight:800,color:"#1b4332",width:"35%" }}>BlogMaster AI 🚀</th>
              </tr></thead>
              <tbody>
                {[["원고 작성","1~2시간 직접 작성","3분 AI 자동 생성"],["SEO 최적화","키워드 분석 별도 학습","자동 키워드 분석·배치"],["이미지 제작","포토샵·캔바로 편집","AI 자동 생성 + 썸네일 합성"],["블로그 발행","수동 복사-붙여넣기","크롬 확장 프로그램 자동 발행"],["순위 추적","매번 직접 검색해서 확인","자동 추적 + 대시보드 기록"],["하루 소요 시간","3~4시간","3분"]].map(([item,manual,ai],i)=>(
                  <tr key={i} style={{ borderBottom:i<5?"1px solid var(--border)":"none" }}>
                    <td style={{ padding:"16px 20px",fontWeight:700,color:"var(--text-primary)" }}>{item}</td>
                    <td style={{ padding:"16px 20px",textAlign:"center",color:"var(--text-secondary)" }}>{manual}</td>
                    <td style={{ padding:"16px 20px",textAlign:"center",fontWeight:700,color:"#1b4332",background:"rgba(27,67,50,0.03)" }}>✅ {ai}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ═══ COMPARE 2: 기존 자동화 vs BlogMaster AI ═══ */}
      <section style={{ padding:"0 24px 100px" }}>
        <div style={{ maxWidth:960,margin:"0 auto" }}>
          <div style={{ textAlign:"center",marginBottom:56 }}>
            <h2 style={{ fontSize:"clamp(24px,3.2vw,40px)",fontWeight:900,letterSpacing:"-1px" }}>기존 자동화 프로그램과 뭐가 다를까?</h2>
            <p style={{ fontSize:15,color:"var(--text-secondary)",marginTop:12,maxWidth:560,margin:"12px auto 0" }}>API 우회 방식의 위험 없이, 내 PC 브라우저에서 안전하게 발행합니다</p>
          </div>
          <div style={{ borderRadius:20,overflow:"hidden",border:"1px solid var(--border)",boxShadow:"var(--shadow-md)" }}>
            <table style={{ width:"100%",borderCollapse:"collapse",fontSize:14 }}>
              <thead><tr>
                <th style={{ padding:"18px 20px",textAlign:"left",background:"var(--bg-secondary)",borderBottom:"1px solid var(--border)",fontSize:13,fontWeight:800,color:"var(--text-muted)",width:"28%" }}>항목</th>
                <th style={{ padding:"18px 20px",textAlign:"center",background:"var(--bg-secondary)",borderBottom:"1px solid var(--border)",fontSize:13,fontWeight:800,color:"var(--text-muted)",width:"36%" }}>기존 자동화 프로그램</th>
                <th style={{ padding:"18px 20px",textAlign:"center",background:"rgba(27,67,50,0.08)",borderBottom:"1px solid var(--border)",fontSize:13,fontWeight:800,color:"#1b4332",width:"36%" }}>BlogMaster AI</th>
              </tr></thead>
              <tbody>
                {[["발행 방식","API 우회 · 봇 탐지 위험","크롬 확장 프로그램 (실제 사용자 행동)"],["원고 품질","템플릿 반복 · 저품질","고품질 SEO 맞춤 원고"],["이미지","직접 업로드 필요","AI 자동 생성 + 텍스트 합성"],["계정 안전성","캡차·차단 리스크 높음","내 PC 브라우저 사용, 차단 없음"],["커스터마이징","제한적 템플릿만 지원","계정별 말투·프롬프트·푸터 개별 설정"],["순위 추적","미지원 또는 별도 구매","기본 제공 · 자동 일별 기록"]].map(([item,old,ours],i)=>(
                  <tr key={i} style={{ borderBottom:i<5?"1px solid var(--border)":"none" }}>
                    <td style={{ padding:"16px 20px",fontWeight:700,color:"var(--text-primary)" }}>{item}</td>
                    <td style={{ padding:"16px 20px",textAlign:"center",color:"var(--text-muted)" }}>⚠️ {old}</td>
                    <td style={{ padding:"16px 20px",textAlign:"center",fontWeight:700,color:"#1b4332",background:"rgba(27,67,50,0.03)" }}>✅ {ours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" style={{ padding:"100px 24px",background:"var(--bg-secondary)" }}>
        <div style={{ maxWidth:1100,margin:"0 auto" }}>
          <div style={{ textAlign:"center",marginBottom:64 }}>
            <div style={{ fontSize:13,fontWeight:800,color:"var(--accent)",letterSpacing:2,textTransform:"uppercase",marginBottom:12 }}>ALL-IN-ONE PLATFORM</div>
            <h2 style={{ fontSize:"clamp(26px,3.6vw,44px)",fontWeight:900,letterSpacing:"-1px" }}>블로그 운영의 모든 것을 자동화</h2>
            <p style={{ fontSize:15,color:"var(--text-secondary)",marginTop:12,maxWidth:500,margin:"12px auto 0" }}>원고 생성부터 발행, 순위 추적까지 6개 모듈이 하나로</p>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(320px, 1fr))",gap:20 }}>
            {[
              { icon:"✍️",title:"AI 원고 자동 생성",desc:"SEO에 최적화된 블로그 원고를 작성합니다. 키워드 밀도, 문단 구조, 인용구 배치까지 자동으로.",points:["키워드 분석 → 원고 자동 작성","네이버 SEO 가이드라인 준수","말투·톤 커스터마이징"],gradient:"linear-gradient(135deg, #1b4332, #2d6a4f)" },
              { icon:"🖼️",title:"이미지·썸네일 자동 생성",desc:"본문에 어울리는 AI 이미지를 생성하고 썸네일에 텍스트를 자동으로 합성합니다.",points:["AI 이미지 생성","Sharp 썸네일 텍스트 합성","4가지 썸네일 스타일 선택"],gradient:"linear-gradient(135deg, #2d6a4f, #40916c)" },
              { icon:"🚀",title:"네이버 블로그 자동 발행",desc:"Chrome 확장 프로그램이 스마트에디터를 직접 조작해 발행합니다. 인간의 타이핑 패턴(휴먼 타이핑)과 자연스러운 딜레이 기술을 적용하여 어뷰징 감지 및 저품질 리스크를 완벽하게 방지합니다.",points:["스마트에디터 자동 조작 & 휴먼 타이핑","어뷰징·저품질 차단 기술 적용","예약 발행 스케줄링 & 멀티 계정"],gradient:"linear-gradient(135deg, #40916c, #52b788)" },
              { icon:"📊",title:"SEO 순위 실시간 추적",desc:"발행된 포스팅이 네이버 검색에서 몇 위인지 자동으로 체크하고 변화를 기록합니다.",points:["상위 200위 내 자동 탐색","일별 순위 변화 기록","키워드별 직접 검색 분석"],gradient:"linear-gradient(135deg, #10b981, #059669)" },
              { icon:"🔑",title:"황금 키워드 분석",desc:"경쟁도 낮고 조회수 높은 키워드를 자동으로 발굴합니다.",points:["조회수·경쟁 자동 분석","연관 키워드 발굴","월간 검색량 기준 필터링"],gradient:"linear-gradient(135deg, #f59e0b, #d97706)" },
              { icon:"⚡",title:"Chrome 확장 프로그램 발행",desc:"서버 자동화 대신 내 PC 브라우저로 직접 발행. 사람처럼 자연스럽게 타이핑하여 봇 감지나 계정 차단 없이 안전합니다.",points:["내 브라우저 직접 제어 & 휴먼 타이핑","캡차·저품질 리스크 없이 안전 발행","실시간 발행 진행 로그 확인"],gradient:"linear-gradient(135deg, #ef4444, #dc2626)" },
            ].map((f,i)=>(
              <div key={i} className="feature-card" style={{ padding:32,background:"var(--bg-card)",borderRadius:20,border:"1px solid var(--border)",transition:"transform 0.3s ease, box-shadow 0.3s ease",cursor:"default" }}>
                <div style={{ width:48,height:48,borderRadius:14,background:f.gradient,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,marginBottom:20,boxShadow:"0 4px 16px rgba(0,0,0,0.12)" }}>{f.icon}</div>
                <h3 style={{ fontSize:18,fontWeight:800,marginBottom:10 }}>{f.title}</h3>
                <p style={{ fontSize:13.5,color:"var(--text-secondary)",lineHeight:1.7,marginBottom:18 }}>{f.desc}</p>
                <ul style={{ listStyle:"none",display:"flex",flexDirection:"column",gap:8 }}>
                  {f.points.map((pt,pi)=>(<li key={pi} style={{ display:"flex",alignItems:"center",gap:8,fontSize:13,color:"var(--text-muted)" }}><span style={{ color:"#10b981",fontWeight:900,fontSize:14 }}>✓</span> {pt}</li>))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PROCESS ═══ */}
      <section id="process" style={{ padding:"100px 24px",background:"var(--bg-primary)" }}>
        <div style={{ maxWidth:1320,margin:"0 auto" }}>
          <div style={{ textAlign:"center",marginBottom:56 }}>
            <div style={{ fontSize:13,fontWeight:800,color:"var(--accent)",letterSpacing:2,textTransform:"uppercase",marginBottom:12 }}>HOW IT WORKS</div>
            <h2 style={{ fontSize:"clamp(26px,3.6vw,44px)",fontWeight:900,letterSpacing:"-1px" }}>주제 입력부터 발행까지 5단계</h2>
          </div>
          <div className="process-layout" style={{ display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,560px)",gap:48,alignItems:"start" }}>
            <div style={{ display:"flex",flexDirection:"column" }}>
              {PROCESS_STEPS.map((step,i)=>{
                const active = i === demoStep;
                return (
                  <div key={i} onClick={()=>jumpToStep(i)} className="process-row" style={{ display:"flex",gap:20,alignItems:"flex-start",cursor:"pointer",padding:"22px 24px",borderRadius:16,background:active?"var(--bg-secondary)":"transparent",border:active?"1px solid var(--border)":"1px solid transparent",marginBottom:8,transition:"all 0.25s ease" }}>
                    <div style={{ width:44,height:44,borderRadius:12,flexShrink:0,background:active?"var(--accent)":"var(--bg-secondary)",color:active?"#fff":"var(--text-muted)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,transition:"all 0.25s ease" }}>{step.num}</div>
                    <div style={{ flex:1 }}>
                      <h3 style={{ fontSize:17,fontWeight:800,marginBottom:6,color:"var(--text-primary)" }}>{step.title}</h3>
                      <p style={{ fontSize:13.5,color:"var(--text-secondary)",lineHeight:1.7 }}>{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="process-demo-sticky"><ProcessDemoPanel stepIndex={demoStep} elapsed={demoElapsed} onJump={jumpToStep}/></div>
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" style={{ padding:"100px 24px",background:"var(--bg-secondary)" }}>
        <div style={{ maxWidth:1100,margin:"0 auto" }}>
          <div style={{ textAlign:"center",marginBottom:64 }}>
            <div style={{ fontSize:13,fontWeight:800,color:"var(--accent)",letterSpacing:2,textTransform:"uppercase",marginBottom:12 }}>PRICING</div>
            <h2 style={{ fontSize:"clamp(26px,3.6vw,44px)",fontWeight:900,letterSpacing:"-1px" }}>합리적인 요금제</h2>
            <p style={{ fontSize:15,color:"var(--text-secondary)",marginTop:12 }}>모든 요금제에서 원고 생성·자동 발행 무제한</p>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))",gap:24,alignItems:"start" }}>
            {/* Base */}
            <div className="pricing-card" style={{ padding:"40px 32px",borderRadius:24,background:"var(--bg-card)",border:"1px solid var(--border)",transition:"transform 0.3s ease, box-shadow 0.3s ease" }}>
              <div style={{ fontSize:13,fontWeight:800,color:"var(--text-muted)",letterSpacing:1,textTransform:"uppercase",marginBottom:8 }}>Base</div>
              <div style={{ fontSize:14,color:"var(--text-secondary)",marginBottom:24 }}>블로그 운영을 시작하는 개인 사용자</div>
              <div style={{ display:"flex",alignItems:"baseline",gap:4,marginBottom:32 }}>
                <span style={{ fontSize:42,fontWeight:900,color:"var(--text-primary)" }}>₩35,000</span>
                <span style={{ fontSize:13,color:"var(--text-muted)" }}>/월</span>
                <span style={{ fontSize:11,color:"var(--text-muted)",marginLeft:4 }}>(VAT 별도)</span>
              </div>
              <Link href="/signup" className="pricing-btn-outline" style={{ display:"block",textAlign:"center",textDecoration:"none",padding:"14px 0",borderRadius:12,border:"2px solid var(--accent)",color:"var(--accent)",fontWeight:800,fontSize:15,marginBottom:32,transition:"all 0.2s ease" }}>시작하기</Link>
              <ul style={{ listStyle:"none",display:"flex",flexDirection:"column",gap:14 }}>
                {["네이버 아이디 1개","커스텀 프롬프트 1개","원고 생성 무제한","자동 발행 무제한","SEO 순위 추적","황금 키워드 분석"].map((f,i)=>(
                  <li key={i} style={{ display:"flex",alignItems:"center",gap:10,fontSize:14,color:"var(--text-secondary)" }}><span style={{ color:"#10b981",fontWeight:900 }}>✓</span> {f}</li>
                ))}
              </ul>
            </div>
            {/* Pro */}
            <div className="pricing-card pricing-pro" style={{ padding:"40px 32px",borderRadius:24,background:"var(--bg-card)",border:"2px solid #1b4332",position:"relative",boxShadow:"0 8px 40px rgba(27,67,50,0.15)",transition:"transform 0.3s ease, box-shadow 0.3s ease" }}>
              <div style={{ position:"absolute",top:-14,left:"50%",transform:"translateX(-50%)",background:"linear-gradient(135deg, #1b4332, #2d6a4f)",color:"#fff",padding:"6px 24px",borderRadius:100,fontSize:12,fontWeight:800,letterSpacing:1 }}>🔥 가장 인기</div>
              <div style={{ fontSize:13,fontWeight:800,color:"#1b4332",letterSpacing:1,textTransform:"uppercase",marginBottom:8 }}>Pro</div>
              <div style={{ fontSize:14,color:"var(--text-secondary)",marginBottom:24 }}>본격적인 블로그 마케팅을 위한 프로 사용자</div>
              <div style={{ display:"flex",alignItems:"baseline",gap:4,marginBottom:32 }}>
                <span style={{ fontSize:42,fontWeight:900,color:"var(--text-primary)" }}>₩45,000</span>
                <span style={{ fontSize:13,color:"var(--text-muted)" }}>/월</span>
                <span style={{ fontSize:11,color:"var(--text-muted)",marginLeft:4 }}>(VAT 별도)</span>
              </div>
              <Link href="/signup" style={{ display:"block",textAlign:"center",textDecoration:"none",padding:"14px 0",borderRadius:12,background:"linear-gradient(135deg, #1b4332, #2d6a4f)",color:"#fff",fontWeight:800,fontSize:15,marginBottom:32,boxShadow:"0 4px 16px rgba(27,67,50,0.3)",transition:"all 0.2s ease" }}>Pro로 시작하기</Link>
              <ul style={{ listStyle:"none",display:"flex",flexDirection:"column",gap:14 }}>
                {[["네이버 아이디 3개",true],["아이디당 커스텀 프롬프트 3개",true],["원고 생성 무제한",false],["자동 발행 무제한",false],["SEO 순위 추적",false],["황금 키워드 분석",false],["멀티 계정 동시 운영",true]].map(([f,hl],i)=>(
                  <li key={i} style={{ display:"flex",alignItems:"center",gap:10,fontSize:14,color:hl?"var(--text-primary)":"var(--text-secondary)",fontWeight:hl?700:400 }}><span style={{ color:"#10b981",fontWeight:900 }}>✓</span> {f}</li>
                ))}
              </ul>
            </div>
            {/* Company */}
            <div className="pricing-card" style={{ padding:"40px 32px",borderRadius:24,background:"var(--bg-card)",border:"1px solid var(--border)",transition:"transform 0.3s ease, box-shadow 0.3s ease" }}>
              <div style={{ fontSize:13,fontWeight:800,color:"var(--text-muted)",letterSpacing:1,textTransform:"uppercase",marginBottom:8 }}>Company</div>
              <div style={{ fontSize:14,color:"var(--text-secondary)",marginBottom:24 }}>대규모 블로그 마케팅을 위한 기업·에이전시</div>
              <div style={{ display:"flex",alignItems:"baseline",gap:4,marginBottom:32 }}>
                <span style={{ fontSize:36,fontWeight:900,color:"var(--text-primary)" }}>별도 문의</span>
              </div>
              <a href="mailto:vbxn4321@gmail.com" style={{ display:"block",textAlign:"center",textDecoration:"none",padding:"14px 0",borderRadius:12,border:"2px solid var(--border)",color:"var(--text-primary)",fontWeight:800,fontSize:15,marginBottom:32,transition:"all 0.2s ease" }}>상담 문의하기</a>
              <ul style={{ listStyle:"none",display:"flex",flexDirection:"column",gap:14 }}>
                {[["네이버 아이디 무제한",true],["커스텀 프롬프트 무제한",true],["원고 생성 무제한",false],["자동 발행 무제한",false],["전담 매니저 배정",true],["맞춤 기능 개발",true],["우선 기술 지원",true]].map(([f,hl],i)=>(
                  <li key={i} style={{ display:"flex",alignItems:"center",gap:10,fontSize:14,color:hl?"var(--text-primary)":"var(--text-secondary)",fontWeight:hl?700:400 }}><span style={{ color:"#10b981",fontWeight:900 }}>✓</span> {f}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ COMING SOON ═══ */}
      <section style={{ padding:"60px 24px" }}>
        <div style={{ maxWidth:960,margin:"0 auto",background:"linear-gradient(135deg, #0c0a09 0%, #1b4332 100%)",borderRadius:24,padding:"48px 40px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:32,flexWrap:"wrap",position:"relative",overflow:"hidden" }}>
          <div style={{ position:"absolute",top:-60,right:-60,width:200,height:200,borderRadius:"50%",background:"rgba(16,185,129,0.15)",filter:"blur(60px)",pointerEvents:"none" }}/>
          <div style={{ position:"relative",zIndex:1 }}>
            <div style={{ display:"inline-flex",alignItems:"center",gap:8,padding:"6px 16px",background:"rgba(16,185,129,0.15)",border:"1px solid rgba(16,185,129,0.3)",borderRadius:100,marginBottom:16 }}>
              <span style={{ fontSize:12,fontWeight:800,color:"#10b981",letterSpacing:1 }}>COMING SOON</span>
            </div>
            <h3 style={{ fontSize:"clamp(20px,2.4vw,28px)",fontWeight:900,color:"#fff",lineHeight:1.3,marginBottom:8 }}>🎬 인스타그램 릴스 · 유튜브 쇼츠</h3>
            <p style={{ fontSize:15,color:"#a8a29e",lineHeight:1.7,maxWidth:460 }}>블로그 원고를 기반으로 숏폼 영상을 자동 생성하고 발행하는 기능이 곧 출시됩니다.<br/><strong style={{ color:"#d8f3dc" }}>기존 구독자는 추가 요금 없이</strong> 사용할 수 있습니다.</p>
          </div>
          <div style={{ display:"flex",gap:16,position:"relative",zIndex:1 }}>
            {[{icon:"📸",label:"Instagram\nReels"},{icon:"▶️",label:"YouTube\nShorts"}].map((item,i)=>(
              <div key={i} style={{ width:100,height:100,borderRadius:20,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6 }}>
                <span style={{ fontSize:28 }}>{item.icon}</span>
                <span style={{ fontSize:10,fontWeight:700,color:"#d6d3d1",textAlign:"center",whiteSpace:"pre-line",lineHeight:1.3 }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section style={{ padding:"100px 24px",background:"var(--bg-primary)" }}>
        <div style={{ maxWidth:680,margin:"0 auto",textAlign:"center" }}>
          <h2 style={{ fontSize:"clamp(26px,3.8vw,48px)",fontWeight:900,letterSpacing:"-1.5px",lineHeight:1.15,marginBottom:20 }}>
            블로그 운영, 이제<br/><span style={{ background:"linear-gradient(135deg, #1b4332, #10b981)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>AI에게 맡기세요</span>
          </h2>
          <p style={{ fontSize:16,color:"var(--text-secondary)",lineHeight:1.8,marginBottom:44 }}>반복적인 원고 작성, 이미지 제작, 발행 작업에서 벗어나<br/>전략과 기획에만 집중할 수 있습니다.</p>
          <Link href="/signup" style={{ textDecoration:"none",background:"linear-gradient(135deg, #1b4332, #2d6a4f)",color:"#fff",fontSize:17,fontWeight:800,padding:"18px 48px",borderRadius:14,display:"inline-block",boxShadow:"0 4px 24px rgba(27,67,50,0.3)",transition:"transform 0.2s, box-shadow 0.2s" }}>무료체험하기 →</Link>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ borderTop:"1px solid var(--border)",background:"#0c0a09",color:"#a8a29e",padding:"64px 24px 40px" }}>
        <div style={{ maxWidth:1100,margin:"0 auto" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:40,marginBottom:48,paddingBottom:48,borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:12 }}>
                <span style={{ width:10,height:10,background:"#1b4332",borderRadius:2 }}/>
                <span style={{ fontSize:18,fontWeight:900,color:"#fff",letterSpacing:"-0.5px" }}>BlogMaster AI</span>
              </div>
              <div style={{ fontSize:13,color:"#78716c",lineHeight:1.7 }}>AI 기반 네이버 블로그 자동화 플랫폼<br/>주제만 입력하면 원고 생성부터 발행까지</div>
            </div>
            <div style={{ display:"flex",gap:40,flexWrap:"wrap" }}>
              <div>
                <div style={{ fontSize:12,fontWeight:800,color:"#fff",marginBottom:16,letterSpacing:1,textTransform:"uppercase" }}>서비스</div>
                <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                  {[["서비스 소개","features"],["비교","compare"],["가격","pricing"],["작동 방식","process"]].map(([label,id])=>(
                    <button key={id} onClick={()=>scrollTo(id)} style={{ background:"none",border:"none",color:"#78716c",fontSize:13,cursor:"pointer",padding:0,textAlign:"left",transition:"color 0.2s" }}
                      onMouseEnter={e=>e.target.style.color="#fff"} onMouseLeave={e=>e.target.style.color="#78716c"}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize:12,fontWeight:800,color:"#fff",marginBottom:16,letterSpacing:1,textTransform:"uppercase" }}>고객 지원</div>
                <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                  <a href="mailto:vbxn4321@gmail.com" style={{ color:"#78716c",fontSize:13,textDecoration:"none",transition:"color 0.2s" }} onMouseEnter={e=>e.target.style.color="#fff"} onMouseLeave={e=>e.target.style.color="#78716c"}>이메일 문의</a>
                  <a href="tel:010-2265-4321" style={{ color:"#78716c",fontSize:13,textDecoration:"none",transition:"color 0.2s" }} onMouseEnter={e=>e.target.style.color="#fff"} onMouseLeave={e=>e.target.style.color="#78716c"}>전화 문의</a>
                </div>
              </div>
              <div>
                <div style={{ fontSize:12,fontWeight:800,color:"#fff",marginBottom:16,letterSpacing:1,textTransform:"uppercase" }}>법적 고지</div>
                <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                  <span style={{ color:"#78716c",fontSize:13,cursor:"pointer" }}>이용약관</span>
                  <span style={{ color:"#78716c",fontSize:13,cursor:"pointer" }}>개인정보처리방침</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ fontSize:12,color:"#57534e",lineHeight:2 }}>
            <div style={{ marginBottom:8 }}><strong style={{ color:"#78716c" }}>84컴퍼니</strong> &nbsp;|&nbsp; 대표자: 정진아 &nbsp;|&nbsp; 사업자등록번호: 754-12-00298 &nbsp;|&nbsp; 통신판매업신고번호: 제 2019-광주북구-0895 호</div>
            <div style={{ marginBottom:8 }}>주소: 광주광역시 북구 첨단연신로91번길 38, 4층 402-2호(신용동)</div>
            <div style={{ marginBottom:8 }}>개인정보보호책임자: 정진아 (vbxn4321@gmail.com) &nbsp;|&nbsp; 고객센터: 010-2265-4321 &nbsp;|&nbsp; 이메일: vbxn4321@gmail.com</div>
            <div>호스팅 제공자: Vercel</div>
          </div>
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)",marginTop:32,paddingTop:24,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12 }}>
            <div style={{ fontSize:12,color:"#57534e" }}>© 2026 84컴퍼니. All rights reserved.</div>
            <div style={{ fontSize:12,color:"#57534e" }}>Powered by BlogMaster AI</div>
          </div>
        </div>
      </footer>

      {/* ═══ STYLES ═══ */}
      <style>{`
        .demo-caret { opacity:1; animation:demoBlink 0.9s step-end infinite; }
        @keyframes demoBlink { 0%,49%{opacity:1;} 50%,100%{opacity:0;} }
        @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
        .feature-card:hover { transform:translateY(-4px)!important; box-shadow:0 12px 40px rgba(0,0,0,0.1)!important; }
        .pricing-card:hover { transform:translateY(-4px)!important; box-shadow:0 12px 40px rgba(0,0,0,0.1)!important; }
        .pricing-pro:hover { transform:translateY(-6px)!important; box-shadow:0 16px 48px rgba(27,67,50,0.2)!important; }
        .pain-card:hover { transform:translateY(-3px)!important; box-shadow:0 8px 24px rgba(0,0,0,0.06)!important; }
        @media (min-width:769px) { .process-demo-sticky { position:sticky; top:100px; } }
        @media (max-width:768px) {
          .desktop-nav { display:none!important; }
          .hero-grid { grid-template-columns:1fr!important; }
          .process-layout { grid-template-columns:1fr!important; }
          .process-demo-sticky { order:-1; margin-bottom:32px; }
        }
        @media (max-width:480px) { .process-row { flex-direction:column!important; gap:12px!important; } }
      `}</style>
    </div>
  );
}
