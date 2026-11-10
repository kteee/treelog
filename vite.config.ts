import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages는 사이트를 저장소 이름 아래(/treelog/)에서 연다.
// 자동 배포에서는 BASE_PATH로 실제 저장소 이름을 넘기고, 로컬에서는 루트에서 연다.
export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? (mode === "public" ? "/treelog/" : "/"),
  plugins: [react()],
}));
