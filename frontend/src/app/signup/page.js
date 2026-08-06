"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── 약관 전문 ─────────────────────────────────────────────────────────────────

const TERMS_CONTENT = `블로그 마스터 AI 서비스 이용약관

제1조 (목적)
이 약관은 블로그 마스터 AI(이하 "서비스")를 운영하는 정진아(이하 "회사")와 서비스를 이용하는 회원 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.

제2조 (사업자 정보)
- 서비스명: 블로그 마스터 AI
- 운영자: 정진아
- 이메일: vbxn4321@gmail.com

제3조 (정의)
1. "서비스"란 회사가 제공하는 네이버 블로그 자동화 플랫폼(AI 원고 생성, 이미지 생성, 자동 발행 등) 일체를 의미합니다.
2. "회원"이란 본 약관에 동의하고 서비스에 가입하여 이용하는 자를 의미합니다.
3. "콘텐츠"란 회원이 서비스를 통해 생성·발행하는 블로그 글, 이미지 등 일체를 의미합니다.
4. "네이버 계정"이란 회원이 서비스에 등록하는 네이버 아이디 및 비밀번호를 의미합니다.

제4조 (약관의 효력 및 변경)
1. 본 약관은 서비스를 이용하고자 하는 모든 회원에게 적용됩니다.
2. 회사는 약관의 규제에 관한 법률 등 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있습니다.
3. 약관이 변경되는 경우, 회사는 적용일 7일 전에 서비스 내 공지합니다. 단, 회원에게 불리한 변경의 경우 30일 전에 공지합니다.
4. 회원이 변경된 약관에 동의하지 않을 경우, 서비스 이용을 중단하고 탈퇴할 수 있습니다. 공지 후 계속 이용하면 변경 약관에 동의한 것으로 봅니다.

제5조 (이용 계약의 성립 및 제한)
1. 이용 계약은 회원이 본 약관 및 개인정보 처리방침에 동의하고 회원가입을 완료함으로써 성립합니다.
2. 만 14세 미만인 자는 서비스에 가입할 수 없습니다. 회사는 가입 시 생년월일을 통해 이를 확인합니다.
3. 다음에 해당하는 경우 회사는 가입을 거절하거나 이용 계약을 해지할 수 있습니다.
   - 타인의 정보를 도용하여 가입한 경우
   - 허위 정보를 기재한 경우
   - 이전에 이용 제한을 받은 경우

제6조 (서비스의 제공)
1. 회원은 서비스를 통해 AI 기반 블로그 원고 생성, AI 이미지 생성, 네이버 블로그 자동 발행, 키워드 분석, 순위 추적 기능을 이용할 수 있습니다.
2. 서비스는 무료(Free) 플랜과 유료(Pro) 플랜으로 구분되며, 각 플랜의 이용 가능 기능 및 요금은 서비스 내 별도 안내 페이지에서 확인할 수 있습니다.
3. 회사는 서비스 품질 향상을 위해 사전 고지 후 서비스 내용을 변경하거나 일시 중단할 수 있습니다.
4. 서비스는 Google Gemini API, 네이버 외부 API 등 제3자 서비스를 활용하며, 해당 서비스의 정책 변경으로 인해 기능이 제한될 수 있습니다.

제7조 (네이버 계정 이용에 관한 사항)
1. 회원은 서비스 이용을 위해 자신의 네이버 계정 정보(아이디, 비밀번호)를 서비스에 등록할 수 있습니다.
2. 회원이 등록한 네이버 계정 정보는 네이버 블로그 자동 발행 목적으로만 사용됩니다.
3. 서비스를 통한 자동화 발행이 네이버 이용약관에 위반될 수 있으며, 이로 인한 네이버 계정 제한·정지·영구 이용 불가 등의 불이익은 전적으로 회원이 책임지며, 회사는 이에 대해 책임을 지지 않습니다.
4. 회원은 타인의 네이버 계정을 무단으로 등록·사용해서는 안 됩니다.

제8조 (지식재산권)
1. 서비스의 소프트웨어, UI, 디자인, 브랜드 등에 관한 지식재산권은 회사에 귀속됩니다.
2. 회원이 서비스를 통해 생성한 콘텐츠의 저작권은 원칙적으로 회원에게 귀속됩니다. 단, AI가 생성한 결과물의 저작권 귀속은 관련 법령 및 판례에 따릅니다.
3. 회원은 서비스를 통해 타인의 저작권, 상표권 등 지식재산권을 침해하는 콘텐츠를 생성·발행해서는 안 됩니다.

제9조 (회원의 의무)
1. 회원은 가입 시 정확한 정보를 입력하여야 하며, 변경 시 즉시 수정하여야 합니다.
2. 회원은 계정 정보(이메일, 비밀번호)를 타인에게 양도하거나 공유해서는 안 됩니다.
3. 회원은 다음 행위를 해서는 안 됩니다.
   - 타인의 개인정보 또는 계정을 도용하는 행위
   - 스팸, 허위 정보, 음란물, 명예훼손 등 불법 콘텐츠를 생성·발행하는 행위
   - 타인의 지식재산권을 침해하는 콘텐츠를 생성·발행하는 행위
   - 서비스의 정상적인 운영을 방해하거나 서버에 과부하를 주는 행위
   - 관련 법령 및 본 약관을 위반하는 모든 행위

제10조 (서비스 이용 제한 및 해지)
1. 회사는 회원이 본 약관을 위반한 경우 경고, 일시 정지, 영구 이용 정지 등의 조치를 취할 수 있습니다.
2. 회원은 언제든지 서비스 내 탈퇴 기능을 통해 이용 계약을 해지할 수 있습니다.
3. 이용 계약 해지 시 회원의 개인정보 및 데이터는 개인정보 처리방침에 따라 처리됩니다.

제11조 (책임 제한)
1. 회사는 천재지변, 전쟁, 서비스 장애, 네이버·Google 등 제3자 서비스의 정책 변경 등 불가항력적 사유로 인한 서비스 중단에 대해 책임을 지지 않습니다.
2. 회원의 귀책 사유로 발생한 손해에 대해 회사는 책임을 지지 않습니다.
3. 회사가 제공하는 AI 생성 콘텐츠의 정확성·완전성을 보증하지 않으며, 회원은 이를 충분히 검토한 후 발행할 책임이 있습니다. 단, 회사의 고의 또는 중대한 과실로 인한 손해는 예외로 합니다.
4. 서비스 이용으로 발생한 네이버 계정 이용 제한 등의 불이익에 대해 회사는 책임을 지지 않습니다.

제12조 (준거법 및 재판 관할)
본 약관은 대한민국 법률에 따라 해석되며, 분쟁 발생 시 서울중앙지방법원을 관할 법원으로 합니다.

부칙
본 약관은 2026년 1월 1일부터 시행합니다.`;

const PRIVACY_CONTENT = `개인정보 수집·이용 동의

블로그 마스터 AI(이하 "서비스")를 운영하는 정진아는 개인정보 보호법 제30조에 따라 아래와 같이 개인정보를 수집·이용합니다.

1. 수집하는 개인정보 항목

【회원 가입 시 수집 항목 (필수)】
- 이메일 주소, 비밀번호
- 이름, 휴대폰번호, 생년월일

【서비스 이용 과정에서 회원이 직접 입력하는 정보】
- 네이버 계정 아이디 및 비밀번호 (블로그 자동 발행 기능 이용 시)
- 네이버 로그인 세션 쿠키 (자동 발행 후 세션 유지 목적)
- Google Gemini API 키 (AI 원고 생성 기능 이용 시)
- 블로그 사업자 정보 (전화번호, 카카오 채널, 주소 등, 선택 입력)

【서비스 이용 과정에서 자동으로 생성·수집되는 정보】
- 서비스 이용 기록 (발행한 블로그 포스트 URL, 주제, 키워드 등)
- 접속 로그, IP 주소, 쿠키, 브라우저 환경 정보

2. 개인정보 수집·이용 목적
- 회원 가입, 본인 확인 및 계정 관리
- 네이버 블로그 자동 발행 서비스 제공
- AI 원고·이미지 생성 서비스 제공
- 키워드 분석 및 순위 추적 서비스 제공
- 고객 문의·불만 처리 및 공지사항 발송
- 서비스 개선을 위한 이용 현황 분석 (익명 통계)

3. 개인정보 보유 및 이용 기간
- 원칙: 회원 탈퇴 시 지체 없이 파기
- 예외: 관계 법령에 따라 보존 의무가 있는 경우 해당 기간 동안 보관
  · 계약 또는 청약철회 기록: 5년 (전자상거래법)
  · 소비자 불만 또는 분쟁 처리 기록: 3년 (전자상거래법)
  · 접속 로그: 3개월 (통신비밀보호법)
  · 표시·광고에 관한 기록: 6개월 (전자상거래법)

4. 개인정보의 파기 절차 및 방법
- 전자 파일 형태: 복구 불가능한 방법으로 영구 삭제
- 보존 기간이 경과한 경우: 해당 기간 종료 후 지체 없이 파기

5. 개인정보의 제3자 제공
서비스는 원칙적으로 회원의 개인정보를 외부에 제공하지 않습니다.
단, 다음의 경우는 예외로 합니다.
- 회원이 사전에 동의한 경우
- 법령에 특별한 규정이 있거나 수사기관의 적법한 요청이 있는 경우

6. 개인정보 처리 위탁 및 국외 이전
서비스의 원활한 운영을 위해 다음 업체에 개인정보 처리를 위탁합니다.
(아래 업체는 국외(미국)에 서버를 운영하며, 해당 국가로 개인정보가 이전됩니다.)

- Supabase Inc. (미국): 회원 인증, 데이터 저장 및 관리
  위탁 항목: 회원 가입 정보 및 서비스 이용 데이터 전체
- Google LLC (미국): Gemini AI API 서비스 운영
  위탁 항목: AI 원고 생성을 위한 키워드·주제 정보

각 업체는 개인정보보호법 등 관련 법령을 준수하며 위탁받은 목적 내에서만 개인정보를 처리합니다.

7. 개인정보의 안전성 확보 조치 (개인정보보호법 제29조)
- 비밀번호 및 네이버 계정 비밀번호: 암호화하여 저장
- 개인정보 접근 권한 최소화 및 관리
- 보안 프로그램 설치 및 주기적 갱신
- 개인정보 취급자 최소화 및 교육 실시

8. 정보주체의 권리·의무 및 행사 방법
회원은 언제든지 다음 권리를 행사할 수 있습니다.
- 개인정보 열람 요청
- 개인정보 정정·삭제 요청
- 개인정보 처리 정지 요청
- 동의 철회 요청

권리 행사는 아래 연락처로 요청하시면 지체 없이 처리합니다.
문의: vbxn4321@gmail.com

9. 개인정보 보호책임자
- 성명: 정진아
- 연락처: vbxn4321@gmail.com

본 동의는 거부하실 수 있습니다. 다만, 필수 항목에 동의하지 않으실 경우 회원 가입 및 서비스 이용이 제한됩니다.

시행일: 2026년 1월 1일`;

// ── 유틸 함수 ──────────────────────────────────────────────────────────────────


function composeBirthDate(year, month, day) {
    if (!year || !month || !day) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year, month) {
    if (!year || !month) return 31;
    return new Date(Number(year), Number(month), 0).getDate();
}

function calcAge(birthDateStr) {
    if (!birthDateStr) return null;
    const birth = new Date(birthDateStr);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

function validateFields({ name, phone1, phone2, phone3, birthYear, birthMonth, birthDay }) {
    const errors = {};
    if (name.trim().length < 2) errors.name = "이름은 2자 이상 입력해주세요.";
    if (phone1.length < 3 || phone2.length !== 4 || phone3.length !== 4)
        errors.phone = "휴대폰번호를 올바르게 입력해주세요.";
    if (!birthYear || !birthMonth || !birthDay) {
        errors.birthDate = "생년월일을 모두 선택해주세요.";
    } else {
        const birthDate = composeBirthDate(birthYear, birthMonth, birthDay);
        const birth = new Date(birthDate);
        const today = new Date();
        if (isNaN(birth.getTime())) {
            errors.birthDate = "유효한 날짜를 선택해주세요.";
        } else if (birth > today) {
            errors.birthDate = "미래 날짜는 선택할 수 없습니다.";
        } else {
            const age = calcAge(birthDate);
            if (age < 14) errors.birthDate = "만 14세 미만은 가입할 수 없습니다.";
        }
    }
    return errors;
}

// ── 약관 모달 ──────────────────────────────────────────────────────────────────

function TermsModal({ type, onClose }) {
    const isTerms = type === "terms";
    const title = isTerms ? "이용약관" : "개인정보 수집·이용 동의";
    const content = isTerms ? TERMS_CONTENT : PRIVACY_CONTENT;

    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, []);

    return createPortal(
        <div
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(0,0,0,0.6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "20px",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    width: "100%", maxWidth: 560,
                    maxHeight: "80vh",
                    display: "flex", flexDirection: "column",
                    overflow: "hidden",
                    boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
                }}
            >
                {/* 헤더 */}
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "20px 24px",
                    borderBottom: "1px solid var(--border)",
                    flexShrink: 0,
                }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                        {title}
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "var(--text-muted)", fontSize: 20, lineHeight: 1,
                            padding: "2px 6px", borderRadius: 6,
                        }}
                    >
                        ✕
                    </button>
                </div>
                {/* 본문 */}
                <div style={{
                    overflowY: "auto", padding: "20px 24px",
                    flex: 1,
                    fontSize: 13, lineHeight: 1.8,
                    color: "var(--text-secondary)",
                    whiteSpace: "pre-wrap",
                }}>
                    {content}
                </div>
                {/* 닫기 버튼 */}
                <div style={{
                    padding: "16px 24px",
                    borderTop: "1px solid var(--border)",
                    flexShrink: 0,
                }}>
                    <button onClick={onClose} className="btn-primary" style={{ width: "100%" }}>
                        확인
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ── 체크박스 컴포넌트 ──────────────────────────────────────────────────────────

function Checkbox({ checked, onChange, label, onViewFull }) {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{
                display: "flex", alignItems: "center", gap: 10,
                cursor: "pointer", userSelect: "none", flex: 1,
            }}>
                <span
                    onClick={onChange}
                    style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        border: checked ? "none" : "1.5px solid var(--border)",
                        background: checked ? "var(--accent)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s", cursor: "pointer",
                    }}
                >
                    {checked && (
                        <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                            <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </span>
                <span onClick={onChange} style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {label}
                </span>
            </label>
            {onViewFull && (
                <button
                    type="button"
                    onClick={onViewFull}
                    style={{
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 12, color: "var(--accent)", textDecoration: "underline",
                        padding: 0, flexShrink: 0, marginLeft: 8,
                    }}
                >
                    전문보기
                </button>
            )}
        </div>
    );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function SignupPage() {
    const [form, setForm] = useState({
        email: "", password: "", passwordConfirm: "", name: "",
        phone1: "", phone2: "", phone3: "",
        birthYear: "", birthMonth: "", birthDay: "",
    });
    const phone2Ref = useRef(null);
    const phone3Ref = useRef(null);
    const [consents, setConsents] = useState({
        terms: false, privacy: false, age14: false, marketing: false,
    });
    const [modal, setModal] = useState(null); // 'terms' | 'privacy' | null
    const [fieldErrors, setFieldErrors] = useState({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    // 이메일 중복 확인 상태: 'idle' | 'checking' | 'available' | 'taken'
    const [emailCheck, setEmailCheck] = useState('idle');
    const router = useRouter();

    useEffect(() => { setMounted(true); }, []);

    const allConsented = consents.terms && consents.privacy && consents.age14;

    const handleAllConsent = () => {
        const next = !allConsented;
        setConsents({ terms: next, privacy: next, age14: next });
    };

    const handleCheckEmail = async () => {
        const email = form.email.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setFieldErrors((fe) => ({ ...fe, email: "유효한 이메일 주소를 입력해주세요." }));
            return;
        }
        setEmailCheck('checking');
        setFieldErrors((fe) => ({ ...fe, email: undefined }));
        try {
            const res = await fetch('/api/auth/check-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            if (data.exists) {
                setEmailCheck('taken');
            } else {
                setEmailCheck('available');
            }
        } catch {
            setEmailCheck('idle');
            setFieldErrors((fe) => ({ ...fe, email: "이메일 확인 중 오류가 발생했습니다." }));
        }
    };

    const handlePhonePartChange = (part, value, nextRef) => {
        const digits = value.replace(/\D/g, "").slice(0, 4);
        setForm((f) => ({ ...f, [part]: digits }));
        setFieldErrors((fe) => ({ ...fe, phone: undefined }));
        if (digits.length === 4 && nextRef?.current) nextRef.current.focus();
    };

    const handleBirthPartChange = (part, value) => {
        setForm((f) => {
            const next = { ...f, [part]: value };
            const composed = composeBirthDate(next.birthYear, next.birthMonth, next.birthDay);
            if (composed) {
                const age = calcAge(composed);
                if (age !== null && age < 14) {
                    setConsents((c) => ({ ...c, age14: false }));
                }
            }
            return next;
        });
        setFieldErrors((fe) => ({ ...fe, birthDate: undefined }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        // 필드 유효성 검사
        const errors = validateFields(form);
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;

        if (emailCheck !== 'available') {
            setFieldErrors((fe) => ({ ...fe, email: "이메일 중복 확인을 먼저 진행해주세요." }));
            return;
        }

        if (form.password !== form.passwordConfirm) {
            setFieldErrors((fe) => ({ ...fe, passwordConfirm: "비밀번호가 일치하지 않습니다." }));
            return;
        }

        // 동의 확인 (버튼이 disabled이지만 이중 체크) (버튼이 disabled이지만 이중 체크)
        if (!allConsented) {
            setError("필수 약관에 모두 동의해주세요.");
            return;
        }

        setLoading(true);
        const supabase = createClient();
        const birthDate = composeBirthDate(form.birthYear, form.birthMonth, form.birthDay);
        const phone = `${form.phone1}-${form.phone2}-${form.phone3}`;
        const { data, error: authError } = await supabase.auth.signUp({
            email: form.email,
            password: form.password,
            options: {
                data: {
                    name: form.name.trim(),
                    phone,
                    birth_date: birthDate,
                    marketing_consent: consents.marketing,
                },
            },
        });

        if (authError) {
            const msg = authError.message;
            if (msg.includes('already registered') || msg.includes('already been registered')) {
                setError("이미 가입된 이메일 주소입니다. 로그인 페이지를 이용해주세요.");
            } else {
                setError(msg);
            }
            setLoading(false);
        } else if (!data?.session && !data?.user?.confirmed_at && data?.user?.identities?.length === 0) {
            // Supabase가 중복 이메일을 에러 없이 반환하는 경우 (이메일 열거 방지 정책)
            setError("이미 가입된 이메일 주소입니다. 로그인 페이지를 이용해주세요.");
            setLoading(false);
        } else if (data?.user && !data?.session) {
            // 이메일 인증이 필요한 경우
            setError("가입 확인 이메일을 발송했습니다. 이메일을 확인한 후 로그인해주세요.");
            setLoading(false);
        } else {
            router.push("/dashboard");
        }
    };

    const isSubmitDisabled = loading || !allConsented;

    return (
        <>
            {mounted && modal && (
                <TermsModal type={modal} onClose={() => setModal(null)} />
            )}

            <div style={{
                minHeight: "100vh",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "radial-gradient(ellipse at top, rgba(0,184,148,0.08), transparent 60%), var(--bg-primary)",
                padding: "40px 20px",
            }}>
                <div className="glass-card animate-in" style={{ maxWidth: 460, width: "100%" }}>
                    <h1 style={{
                        fontSize: 24, fontWeight: 800, marginBottom: 8,
                        backgroundImage: "var(--gradient-1)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                    }}>
                        회원가입
                    </h1>
                    <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 28 }}>
                        블로그 마스터 AI에 가입하고 자동 포스팅을 시작하세요.
                    </p>

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                        {/* 이름 */}
                        <div>
                            <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                                이름 <span style={{ color: "var(--accent)" }}>*</span>
                            </label>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="홍길동"
                                value={form.name}
                                onChange={(e) => {
                                    setForm((f) => ({ ...f, name: e.target.value }));
                                    setFieldErrors((fe) => ({ ...fe, name: undefined }));
                                }}
                                maxLength={20}
                            />
                            {fieldErrors.name && (
                                <p style={{ color: "var(--error)", fontSize: 12, marginTop: 4 }}>{fieldErrors.name}</p>
                            )}
                        </div>

                        {/* 이메일 */}
                        <div>
                            <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                                이메일 <span style={{ color: "var(--accent)" }}>*</span>
                            </label>
                            <div style={{ display: "flex", gap: 8 }}>
                                <input
                                    type="email"
                                    className="input-field"
                                    placeholder="example@email.com"
                                    value={form.email}
                                    onChange={(e) => {
                                        setForm((f) => ({ ...f, email: e.target.value }));
                                        setEmailCheck('idle');
                                        setFieldErrors((fe) => ({ ...fe, email: undefined }));
                                    }}
                                    style={{ flex: 1 }}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={handleCheckEmail}
                                    disabled={emailCheck === 'checking'}
                                    style={{
                                        flexShrink: 0,
                                        padding: "0 14px",
                                        borderRadius: 10,
                                        border: "1px solid var(--border)",
                                        background: emailCheck === 'available' ? "rgba(34,197,94,0.12)" : "var(--bg-secondary)",
                                        color: emailCheck === 'available' ? "#22c55e" : "var(--text-secondary)",
                                        fontSize: 13, fontWeight: 600,
                                        cursor: emailCheck === 'checking' ? "not-allowed" : "pointer",
                                        whiteSpace: "nowrap",
                                        transition: "all 0.15s",
                                    }}
                                >
                                    {emailCheck === 'checking' ? '확인 중...' : '중복 확인'}
                                </button>
                            </div>
                            {emailCheck === 'available' && (
                                <p style={{ color: "#22c55e", fontSize: 12, marginTop: 4 }}>✓ 사용 가능한 이메일입니다.</p>
                            )}
                            {emailCheck === 'taken' && (
                                <p style={{ color: "var(--error)", fontSize: 12, marginTop: 4 }}>✕ 이미 사용 중인 이메일입니다. 로그인 페이지를 이용해주세요.</p>
                            )}
                            {fieldErrors.email && (
                                <p style={{ color: "var(--error)", fontSize: 12, marginTop: 4 }}>{fieldErrors.email}</p>
                            )}
                        </div>

                        {/* 비밀번호 */}
                        <div>
                            <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                                비밀번호 <span style={{ color: "var(--accent)" }}>*</span>
                            </label>
                            <input
                                type="password"
                                className="input-field"
                                placeholder="최소 6자리"
                                value={form.password}
                                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                                minLength={6}
                                required
                            />
                        </div>

                        {/* 비밀번호 확인 */}
                        <div>
                            <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                                비밀번호 확인 <span style={{ color: "var(--accent)" }}>*</span>
                            </label>
                            <input
                                type="password"
                                className="input-field"
                                placeholder="비밀번호를 다시 입력해주세요"
                                value={form.passwordConfirm}
                                onChange={(e) => setForm((f) => ({ ...f, passwordConfirm: e.target.value }))}
                                required
                            />
                            {form.passwordConfirm.length > 0 && (
                                form.password === form.passwordConfirm ? (
                                    <p style={{ color: "#22c55e", fontSize: 12, marginTop: 4 }}>✓ 비밀번호가 일치합니다.</p>
                                ) : (
                                    <p style={{ color: "var(--error)", fontSize: 12, marginTop: 4 }}>✕ 비밀번호가 일치하지 않습니다.</p>
                                )
                            )}
                        </div>

                        {/* 휴대폰번호 */}
                        <div>
                            <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                                휴대폰번호 <span style={{ color: "var(--accent)" }}>*</span>
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {/* 앞자리 */}
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="010"
                                    value={form.phone1}
                                    onChange={(e) => {
                                        const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
                                        setForm((f) => ({ ...f, phone1: digits }));
                                        if (digits.length === 3) phone2Ref.current?.focus();
                                    }}
                                    inputMode="numeric"
                                    maxLength={3}
                                    style={{ flex: 1, textAlign: "center" }}
                                />
                                <span style={{ color: "var(--text-muted)", fontWeight: 700, flexShrink: 0 }}>-</span>
                                {/* 중간 4자리 */}
                                <input
                                    ref={phone2Ref}
                                    type="text"
                                    className="input-field"
                                    placeholder="0000"
                                    value={form.phone2}
                                    onChange={(e) => handlePhonePartChange("phone2", e.target.value, phone3Ref)}
                                    inputMode="numeric"
                                    maxLength={4}
                                    style={{ flex: 1, textAlign: "center" }}
                                />
                                <span style={{ color: "var(--text-muted)", fontWeight: 700, flexShrink: 0 }}>-</span>
                                {/* 끝 4자리 */}
                                <input
                                    ref={phone3Ref}
                                    type="text"
                                    className="input-field"
                                    placeholder="0000"
                                    value={form.phone3}
                                    onChange={(e) => handlePhonePartChange("phone3", e.target.value, null)}
                                    inputMode="numeric"
                                    maxLength={4}
                                    style={{ flex: 1, textAlign: "center" }}
                                />
                            </div>
                            {fieldErrors.phone && (
                                <p style={{ color: "var(--error)", fontSize: 12, marginTop: 4 }}>{fieldErrors.phone}</p>
                            )}
                        </div>

                        {/* 생년월일 */}
                        <div>
                            <label style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                                생년월일 <span style={{ color: "var(--accent)" }}>*</span>
                            </label>
                            <div style={{ display: "flex", gap: 8 }}>
                                {/* 년 */}
                                <select
                                    className="input-field"
                                    value={form.birthYear}
                                    onChange={(e) => handleBirthPartChange("birthYear", e.target.value)}
                                    style={{ flex: 5 }}
                                >
                                    <option value="">년도</option>
                                    {Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                                        <option key={y} value={y}>{y}년</option>
                                    ))}
                                </select>
                                {/* 월 */}
                                <select
                                    className="input-field"
                                    value={form.birthMonth}
                                    onChange={(e) => handleBirthPartChange("birthMonth", e.target.value)}
                                    style={{ flex: 3 }}
                                >
                                    <option value="">월</option>
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                        <option key={m} value={m}>{m}월</option>
                                    ))}
                                </select>
                                {/* 일 */}
                                <select
                                    className="input-field"
                                    value={form.birthDay}
                                    onChange={(e) => handleBirthPartChange("birthDay", e.target.value)}
                                    style={{ flex: 3 }}
                                >
                                    <option value="">일</option>
                                    {Array.from(
                                        { length: daysInMonth(form.birthYear, form.birthMonth) },
                                        (_, i) => i + 1
                                    ).map((d) => (
                                        <option key={d} value={d}>{d}일</option>
                                    ))}
                                </select>
                            </div>
                            {fieldErrors.birthDate && (
                                <p style={{ color: "var(--error)", fontSize: 12, marginTop: 4 }}>{fieldErrors.birthDate}</p>
                            )}
                        </div>

                        {/* 동의 섹션 */}
                        <div style={{
                            marginTop: 4,
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            overflow: "hidden",
                        }}>
                            {/* 전체 동의 */}
                            <div style={{
                                padding: "14px 16px",
                                background: "var(--bg-secondary)",
                                borderBottom: "1px solid var(--border)",
                            }}>
                                <Checkbox
                                    checked={allConsented}
                                    onChange={handleAllConsent}
                                    label={<strong style={{ color: "var(--text-primary)" }}>전체 동의</strong>}
                                />
                            </div>

                            {/* 개별 항목 */}
                            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                                <Checkbox
                                    checked={consents.terms}
                                    onChange={() => setConsents((c) => ({ ...c, terms: !c.terms }))}
                                    label="[필수] 이용약관 동의"
                                    onViewFull={() => setModal("terms")}
                                />
                                <Checkbox
                                    checked={consents.privacy}
                                    onChange={() => setConsents((c) => ({ ...c, privacy: !c.privacy }))}
                                    label="[필수] 개인정보 수집·이용 동의"
                                    onViewFull={() => setModal("privacy")}
                                />
                                <Checkbox
                                    checked={consents.age14}
                                    onChange={() => {
                                        const age = calcAge(form.birthDate);
                                        if (!consents.age14 && age !== null && age < 14) return;
                                        setConsents((c) => ({ ...c, age14: !c.age14 }));
                                    }}
                                    label="[필수] 만 14세 이상입니다"
                                />
                                {/* 만 14세 미만 안내 */}
                                {(() => { const d = composeBirthDate(form.birthYear, form.birthMonth, form.birthDay); return d && calcAge(d) !== null && calcAge(d) < 14; })() && (
                                    <p style={{
                                        fontSize: 12, color: "var(--error)",
                                        padding: "6px 10px",
                                        background: "rgba(239,68,68,0.08)",
                                        borderRadius: 6, marginTop: -4,
                                    }}>
                                        만 14세 미만은 서비스 이용이 불가합니다.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* 마케팅 동의 — 선택 사항이라 필수 동의 박스와 시각적으로 분리 */}
                        <div style={{ padding: "2px 4px" }}>
                            <Checkbox
                                checked={consents.marketing}
                                onChange={() => setConsents((c) => ({ ...c, marketing: !c.marketing }))}
                                label="[선택] 마케팅 정보 수신 동의 (이벤트, 할인 혜택 등 안내)"
                            />
                        </div>

                        {/* 서버 에러 */}
                        {error && (
                            <p style={{
                                color: "var(--error)", fontSize: 13,
                                padding: "8px 12px",
                                background: "rgba(239,68,68,0.1)",
                                borderRadius: 8,
                            }}>
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={isSubmitDisabled}
                            style={{
                                marginTop: 4,
                                opacity: isSubmitDisabled ? 0.5 : 1,
                                cursor: isSubmitDisabled ? "not-allowed" : "pointer",
                            }}
                        >
                            {loading ? "가입 중..." : "가입하기"}
                        </button>
                    </form>

                    <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--text-muted)" }}>
                        이미 계정이 있으신가요?{" "}
                        <Link href="/login" style={{ color: "var(--accent)", textDecoration: "none" }}>
                            로그인
                        </Link>
                    </p>
                </div>
            </div>
        </>
    );
}
