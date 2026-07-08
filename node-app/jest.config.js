/**
 * Jest 설정 파일
 *
 * 필요한 패키지 설치:
 * npm install --save-dev jest @testing-library/react @testing-library/jest-dom @testing-library/user-event jest-environment-jsdom @testing-library/react-hooks
 */

const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // next.config.js와 .env 파일을 로드하기 위한 Next.js 앱 경로
  dir: "./",
});

// Jest에 전달할 커스텀 설정
const customJestConfig = {
  // 각 테스트 실행 전 추가 설정 옵션
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],

  // 테스트 환경
  testEnvironment: "jest-environment-jsdom",

  // 모듈 경로 별칭 (tsconfig.json의 paths와 동일하게)
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },

  // 테스트 파일 패턴
  testMatch: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],

  // 커버리지 수집
  collectCoverageFrom: [
    "components/**/*.{js,jsx,ts,tsx}",
    "!components/**/*.d.ts",
    "!components/**/*.stories.{js,jsx,ts,tsx}",
    "!**/__tests__/**",
  ],

  // 커버리지 임계값 (선택사항)
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },

  // 테스트 타임아웃
  testTimeout: 10000,

  // 변환 무시 패턴
  transformIgnorePatterns: [
    "/node_modules/",
    "^.+\\.module\\.(css|sass|scss)$",
  ],
};

// createJestConfig는 비동기이므로 next/jest가 Next.js 설정을 로드할 수 있도록 내보냅니다
module.exports = createJestConfig(customJestConfig);
