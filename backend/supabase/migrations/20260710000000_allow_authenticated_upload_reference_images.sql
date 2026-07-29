-- "이미지 참조" 발행 모드에서 브라우저가 이미지를 Base64로 인코딩해 Vercel
-- 서버리스 함수(Next.js API 라우트)에 통째로 보내던 방식이, Vercel의 요청 본문
-- 크기 제한(약 4.5MB)에 걸려 "Request Entity Too Large" 에러를 유발하는 문제가 있었음.
--
-- 해결책: 브라우저가 Vercel을 거치지 않고 Supabase Storage에 이미지를 직접
-- 업로드하고, 그 결과 URL만 가볍게 Vercel/백엔드로 전달한다. 이를 위해
-- authenticated 사용자가 blogmaster-images 버킷의 references/ 경로에
-- 업로드할 수 있도록 권한을 부여한다.
--
-- (blogmaster-images 버킷 자체는 backend/engine_api.js의 ensureStorageBucket()이
--  service role 권한으로 이미 생성해두는 public 버킷이며, 이 정책은 그 버킷의
--  references/ 하위 경로에 대한 INSERT 권한만 추가한다.)
CREATE POLICY "authenticated_upload_reference_images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'blogmaster-images'
  AND (storage.foldername(name))[1] = 'references'
);
