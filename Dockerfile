# =================================================================================================
# STAGE 1: 의존성 설치 (Dependencies)
# 이 스테이지는 package.json 또는 package-lock.json이 변경될 때만 재실행됩니다.
# =================================================================================================
FROM node:20-alpine AS deps

WORKDIR /app

# 의존성 캐싱을 위해 package.json과 lock 파일을 먼저 복사
COPY package.json package-lock.json* ./

# npm 캐시를 사용하여 의존성 설치 속도 향상
RUN --mount=type=cache,target=/root/.npm npm ci

# =================================================================================================
# STAGE 2: 빌더 (Builder)
# 이 스테이지는 소스 코드가 변경될 때 재실행됩니다.
# =================================================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# 'deps' 스테이지에서 설치된 node_modules를 그대로 복사
COPY --from=deps /app/node_modules ./node_modules

# 소스 코드는 의존성 설치 이후에 복사하여 캐시 효율을 극대화
COPY . .

# 빌드 시점에 필요한 환경 변수 선언
ARG NEXT_PUBLIC_AUTH_COOKIE_NAME
ARG NEXT_PUBLIC_KAKAO_CLIENT_ID
ARG NEXT_PUBLIC_KAKAO_REDIRECT_URI

# 받은 ARG 값을 ENV로 설정하여 'npm run build' 과정에서 사용
ENV NEXT_PUBLIC_AUTH_COOKIE_NAME=${NEXT_PUBLIC_AUTH_COOKIE_NAME}
ENV NEXT_PUBLIC_KAKAO_CLIENT_ID=${NEXT_PUBLIC_KAKAO_CLIENT_ID}
ENV NEXT_PUBLIC_KAKAO_REDIRECT_URI=${NEXT_PUBLIC_KAKAO_REDIRECT_URI}

# 프로덕션용으로 애플리케이션을 빌드
RUN npm run build

# =================================================================================================
# STAGE 3: 최종 프로덕션 이미지 (Production Runner)
# =================================================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 보안을 위해 root가 아닌 별도의 유저와 그룹을 생성
RUN addgroup --system --gid 1001 appgroup
RUN adduser --system --uid 1001 --ingroup appgroup appuser

# 'builder' 스테이지에서 생성된 빌드 산출물 중 실행에 필요한 것만 복사
COPY --from=builder --chown=appuser:appgroup /app/public ./public
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static

# non-root 유저로 전환
USER appuser

EXPOSE 3000

CMD ["node", "server.js"]

