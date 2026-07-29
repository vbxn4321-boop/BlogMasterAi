-- profiles 테이블에 사용자별 Gemini API 키 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;
