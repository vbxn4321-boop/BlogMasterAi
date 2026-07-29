/** @type {import('next').NextConfig} */
const nextConfig = {
  // ngrok으로 dev 서버를 외부에 노출할 때 cross-origin 요청이 차단되지 않도록 허용
  allowedDevOrigins: ['*.ngrok-free.app', '*.ngrok-free.dev', '*.ngrok.io', '*.ngrok.app'],
};

export default nextConfig;
