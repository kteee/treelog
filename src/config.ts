/**
 * 포트폴리오로 배포하는 공개 빌드(`npm run build:public`)에서만 켜진다.
 * 방문자는 노트를 읽기만 하고, 내용은 브라우저 저장소가 아니라 public/notes.json에서 온다.
 */
export const READ_ONLY = import.meta.env.VITE_READ_ONLY === "true";
