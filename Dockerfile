# Dockerfile

# =================================================================================================
# STAGE 1: 빌더 (Builder)
# =================================================================================================
# 이 스테이지는 의존성 설치와 애플리케이션 빌드를 모두 담당합니다.
FROM node:20-alpine AS builder

# 작업 디렉토리 설정
WORKDIR /app

# Alpine Linux에서 네이티브 모듈 빌드를 위해 필요한 패키지 설치
RUN apk add --no-cache libc6-compat python3 g++ make

# 의존성 캐싱을 위해 package.json과 lock 파일을 먼저 복사
COPY package.json package-lock.json* ./

# devDependencies를 포함한 모든 의존성을 설치합니다.
# 이렇게 해야 'npm run build' 시점에 tailwindcss 같은 도구를 사용할 수 있습니다.
RUN npm ci

# 나머지 소스 코드를 복사합니다.
COPY . .

ARG NEXT_PUBLIC_AUTH_COOKIE_NAME
ARG NEXT_PUBLIC_KAKAO_CLIENT_ID
ARG NEXT_PUBLIC_KAKAO_REDIRECT_URI

# 받은 ARG 값을 ENV로 설정하여 빌드 과정에서 사용합니다.
ENV NEXT_PUBLIC_AUTH_COOKIE_NAME=${NEXT_PUBLIC_AUTH_COOKIE_NAME}
ENV NEXT_PUBLIC_KAKAO_CLIENT_ID=${NEXT_PUBLIC_KAKAO_CLIENT_ID}
ENV NEXT_PUBLIC_KAKAO_REDIRECT_URI=${NEXT_PUBLIC_KAKAO_REDIRECT_URI}

# 프로덕션용으로 애플리케이션을 빌드합니다.
# 이 과정에서 .next/standalone 폴더가 생성됩니다.
RUN npm run build

# =================================================================================================
# STAGE 2: 최종 프로덕션 이미지 (Production Runner)
# =================================================================================================
# 이 단계는 실제 운영에 필요한 최소한의 파일만 포함하여 이미지 크기를 줄이고 보안을 강화합니다.
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 보안을 위해 root가 아닌 별도의 유저를 생성하여 실행합니다.
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 'builder' 스테이지에서 생성된 빌드 산출물 중 실행에 필요한 것만 복사합니다.
COPY --from=builder /app/public ./public

# standalone 폴더를 복사합니다. 이 폴더 안에는 아래 내용이 모두 포함되어 있습니다:
# 1. 서버 실행에 필요한 코드 (server.js 등)
# 2. 실행에 필요한 최소한의 node_modules (전체 복사보다 훨씬 빠름)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 정적 자산(이미지, 폰트 등)을 복사합니다.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static


# ✅ [수정] 캐시 디렉터리를 만들고, 'nextjs' 유저에게 쓰기 권한을 부여합니다.
RUN mkdir .cache && chown nextjs:nodejs .cache

# non-root 유저로 전환합니다.
USER nextjs

# 외부로 노출할 포트를 명시합니다.
EXPOSE 3000

# 컨테이너 실행 시 server.js를 실행하여 Next.js 서버를 시작합니다.
CMD ["node", "server.js"]
