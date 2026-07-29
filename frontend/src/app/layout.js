import "./globals.css";
import { ThemeProvider } from "@/lib/ThemeProvider";

export const metadata = {
  title: "블로그 마스터 AI - Naver Blog Automation",
  description: "AI 기반 네이버 블로그 자동화 서비스. 원고 생성, 이미지 생성, 자동 포스팅, SEO 순위 추적까지.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        {/* 다크 모드 flash 방지: JS 로드 전에 data-theme 적용 */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('blog-master-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');})();` }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
