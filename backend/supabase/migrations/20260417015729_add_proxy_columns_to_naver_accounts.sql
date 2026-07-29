-- Add proxy columns to naver_accounts table
ALTER TABLE naver_accounts
ADD COLUMN IF NOT EXISTS proxy_host TEXT,
ADD COLUMN IF NOT EXISTS proxy_port INTEGER,
ADD COLUMN IF NOT EXISTS proxy_username TEXT,
ADD COLUMN IF NOT EXISTS proxy_password TEXT;
