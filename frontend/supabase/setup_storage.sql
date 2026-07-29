-- Create assets bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to read files in the assets bucket
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'assets' );

-- Allow authenticated users to upload files to the assets bucket
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'assets' );

-- Allow authenticated users to delete their own files or any if needed
-- For now, let's keep it simple: allow authenticated to manage their uploads
CREATE POLICY "Authenticated users can update/delete"
ON storage.objects FOR ALL
TO authenticated
USING ( bucket_id = 'assets' );
