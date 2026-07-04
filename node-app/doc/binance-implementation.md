# 바이낸스 선물 통합 가이드

## 개요

바이낸스 Futures API를 사용한 암호화폐 및 토큰화된 주식 선물 차트 기능 구현

## 제공 데이터

### 토큰화 주식

- ✅ **SOXLUSDT**: SOXL (반도체 ETF)
- ✅ **SPCXUSDT**: SPCX
- ✅ **KORUUSDT**: KORU
- ✅ **NVDAUSDT**: NVIDIA
- ✅ **TSLAUSDT**: Tesla
- ✅ **ARMUSDT**: ARM Holdings
- ✅ **GOOGLUSDT**: Google

### 원자재

- ✅ **XAGUSDT**: Silver (은)
- ✅ **CLUSDT**: Crude Oil (원유)

### 국가 ETF

- ✅ **EWYUSDT**: EWY (한국 ETF)

## 구현 내용

### 1. 바이낸스 API 유틸리티

**파일**: `lib/binanceApi.ts`

```typescript
// 바이낸스 Futures Kline 데이터 가져오기
const data = await getBinanceFuturesData("BTCUSDT", "1d", 500);
```

#### API 엔드포인트

- **Base URL**: `https://fapi.binance.com`
- **Klines**: `/fapi/v1/klines`
- **Exchange Info**: `/fapi/v1/exchangeInfo`

#### 파라미터

```typescript
{
  symbol: "BTCUSDT",    // 심볼 (대문자)
  interval: "1d",       // 1d, 1h, 15m
  limit: 500            // 캔들 개수 (최대 1500)
}
```

### 2. API 라우트

**파일**: `app/api/binance/[symbol]/route.ts`

**엔드포인트**: `/api/binance/{symbol}?timeframe={tf}&refresh={bool}`

**예시**:

```bash
/api/binance/BTCUSDT?timeframe=1d&refresh=true
```

#### 응답 형식

```json
{
  "data": [
    {
      "date": "2026-07-04",
      "open": 65000.5,
      "high": 66000.0,
      "low": 64500.0,
      "close": 65800.0,
      "volume": 1250000.0,
      "rsi": 55.2,
      "bb_upper": 67000.0,
      "bb_middle": 65500.0,
      "bb_lower": 64000.0
    }
  ],
  "signals": [...],
  "advice": null
}
```

### 3. 페이지 구현

**파일**: `app/binance/page.tsx`

**경로**: `http://localhost:3001/binance`

#### 기능

- ✅ 1일봉, 1시간봉, 15분봉 지원
- ✅ RSI, 볼린저 밴드 지표
- ✅ 매매 시그널 분석
- ✅ MongoDB 캔들 데이터 캐싱
- ✅ Redis 메모리 캐시
- ✅ 기존 `StockCollapsibleCard` 재사용

### 4. 설정 파일

**파일**: `lib/stock.json`

```json
{
  "binance_futures": [
    {
      "symbol": "SOXLUSDT",
      "name": "SOXL"
    },
    {
      "symbol": "SPCXUSDT",
      "name": "SPCX"
    },
    {
      "symbol": "NVDAUSDT",
      "name": "NVIDIA"
    },
    {
      "symbol": "TSLAUSDT",
      "name": "Tesla"
    },
    {
      "symbol": "ARMUSDT",
      "name": "ARM Holdings"
    },
    {
      "symbol": "GOOGLUSDT",
      "name": "Google"
    },
    {
      "symbol": "XAGUSDT",
      "name": "Silver"
    },
    {
      "symbol": "CLUSDT",
      "name": "Crude Oil"
    },
    {
      "symbol": "EWYUSDT",
      "name": "EWY (Korea ETF)"
    }
  ]
}
```

### 5. 메인 페이지 링크

**파일**: `app/page.tsx`

```tsx
<Link href="/binance" className={styles.primary}>
  <Bitcoin className={styles.ctaIcon} />
  바이낸스 선물
</Link>
```

### 6. 인증 미들웨어

**파일**: `middleware.ts`

```typescript
const protectedRoutes = [
  "/binance", // 추가됨
  // ...
];
```

## 데이터 플로우

```
1. 사용자가 /binance 페이지 방문
   ↓
2. stock.json에서 심볼 목록 로드 (TSLAUSDT, BTCUSDT 등)
   ↓
3. 각 심볼별로 /api/binance/{symbol} 호출
   ↓
4. getBinanceFuturesData() - 바이낸스 API 호출
   ↓
5. MongoDB에 캔들 데이터 저장 (MARKET_TYPE: "BINANCE")
   ↓
6. RSI, 볼린저 밴드 등 지표 계산
   ↓
7. Redis 캐시에 저장
   ↓
8. 차트에 데이터 표시
```

## 바이낸스 vs KIS 선물 비교

| 항목         | 바이낸스              | KIS                   |
| ------------ | --------------------- | --------------------- |
| **API 접근** | ✅ 무료, 인증 불필요  | ❌ IP 제한, 토큰 필요 |
| **네트워크** | ✅ EC2에서 접속 가능  | ❌ EC2에서 차단됨     |
| **데이터**   | 암호화폐, 토큰화 주식 | 전통 선물 (NQ, ES 등) |
| **속도**     | ⚡ 빠름               | 🐢 느림               |
| **안정성**   | ✅ 99.9% 업타임       | ⚠️ 간헐적 오류        |

## 심볼 추가 방법

### 1. 사용 가능한 심볼 확인

EC2에서 실행:

```bash
curl https://fapi.binance.com/fapi/v1/exchangeInfo | jq '.symbols[] | select(.quoteAsset=="USDT") | .symbol' | head -20
```

### 2. stock.json에 추가

```json
{
  "binance_futures": [
    {
      "symbol": "ADAUSDT",
      "name": "Cardano"
    }
  ]
}
```

### 3. 페이지 새로고침

자동으로 로드됨.

## 테스트 방법

### 1. EC2에서 바이낸스 API 테스트

```bash
# 비트코인 가격 확인
curl https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT

# 캔들 데이터
curl "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1d&limit=10"
```

### 2. 로컬 API 테스트

```bash
# 개발 서버 실행 (EC2)
npm run dev

# 브라우저 접속
http://localhost:3001/binance

# API 직접 호출
curl "http://localhost:3001/api/binance/BTCUSDT?timeframe=1d&refresh=true"
```

### 3. 로그 확인

브라우저 콘솔:

```javascript
[Binance API] Fetching BTCUSDT 1d data...
[Binance API] Successfully fetched 500 candles for BTCUSDT
[INFO] [BTCUSDT] Upserting 10 records to DB...
```

## 트러블슈팅

### 1. "Symbol not found" 에러

**원인**: 잘못된 심볼 또는 미지원 심볼

**해결**:

```bash
# 심볼 존재 확인
curl "https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT"
```

### 2. "Rate limit exceeded"

**원인**: API 호출 한도 초과

**해결**:

- 호출 간격 늘리기 (`setTimeout` 조정)
- 캐시 사용 (`refresh=false`)

### 3. 빈 데이터 반환

**원인**: 심볼이 거래 중지됨

**해결**:

```bash
# 거래 상태 확인
curl https://fapi.binance.com/fapi/v1/exchangeInfo | jq '.symbols[] | select(.symbol=="BTCUSDT") | .status'
```

### 4. MongoDB 연결 오류

**원인**: DB 연결 실패

**해결**:

```bash
# .env 확인
cat .env | grep MONGODB_URI
```

## bStocks (토큰화 주식)

2026년 바이낸스는 7,000+ 미국 주식/ETF를 토큰화했습니다.

### 주요 종목 (현재 추가된 종목)

- **SOXLUSDT**: SOXL (반도체 ETF)
- **NVDAUSDT**: NVIDIA
- **TSLAUSDT**: Tesla
- **ARMUSDT**: ARM Holdings
- **GOOGLUSDT**: Google
- **XAGUSDT**: Silver (은)
- **CLUSDT**: Crude Oil (원유)
- **EWYUSDT**: EWY (한국 ETF)

### 특징

- ✅ 24/7 거래
- ✅ 1:1 실물 주식 담보
- ✅ 5~25배 레버리지
- ✅ USDT 결제

## API 한도

- **Weight**: 1200/분 (IP 기준)
- **Orders**: 300/10초
- **Klines**: 제한 없음 (일반 요청)

## 실시간 WebSocket 구현 ✅

### 1. WebSocket 유틸리티

**파일**: `lib/binanceWebSocket.ts`

- **자동 재연결**: 최대 5회 시도
- **에러 핸들링**: 연결 실패 시 자동 복구
- **타입 안전성**: TypeScript 인터페이스

### 2. 실시간 업데이트 방식

```typescript
// 심볼 열기 시 WebSocket 연결
handleOpenChange(symbol) {
  if (opened) {
    connectWebSocket(symbol);
  } else {
    disconnectWebSocket(symbol);
  }
}

// 실시간 데이터 업데이트
handleWebSocketUpdate(symbol, klineData) {
  // 마지막 캔들 업데이트 또는 새 캔들 추가
  setTickerStates(prev => ({
    ...prev,
    [symbol]: {
      ...prev[symbol],
      data: updatedData
    }
  }));
}
```

### 3. UI 기능

- ⚡ **실시간 버튼**: 클릭으로 WebSocket On/Off
- 🟢 **활성 상태**: 초록색 + 애니메이션
- 🔴 **비활성 상태**: 회색

### 4. WebSocket URL

```
wss://fstream.binance.com/ws/{symbol}@kline_{interval}

예시:
wss://fstream.binance.com/ws/btcusdt@kline_1d
wss://fstream.binance.com/ws/btcusdt@kline_1h
wss://fstream.binance.com/ws/btcusdt@kline_15m
```

## 매매 전략 설정 (.env)

바이낸스 선물을 포함한 **모든 마켓**은 `lib/stockUtils.ts`의 `TRADING_CONFIG` 객체를 통해 `.env` 파일의 매매 전략 설정을 사용합니다.

### 설정 가능한 값

```bash
# 손절 기준 (%)
STOP_LOSS_PERCENT=-8.0

# 시간 제한 (일)
TIME_LIMIT_1D_DAYS=40        # 1일봉 전략
TIME_LIMIT_OTHER_DAYS=2      # 1시간봉/15분봉 전략

# RSI 기준
RSI_OVERSOLD=35              # 과매도 기준
RSI_OVERBOUGHT=65            # 과매수 기준

# 다이버전스 분석 기간
DIVERGENCE_MIN_DAYS=5
DIVERGENCE_MAX_DAYS=90
```

### 손절 로직

1. **시간 기반 손절**:
   - 손실이 `STOP_LOSS_PERCENT`에 도달하면 즉시 손절
   - 예: `-8.0%` 도달 시 자동 손절

2. **동적 손절 (볼린저 밴드 이탈)**:
   - 볼린저 하단(매수) 또는 상단(공매도) 이탈 **AND** 손실이 `STOP_LOSS_PERCENT`를 초과할 때 손절
   - 이전에는 하드코딩된 `-5.0%` 사용 → **✅ 수정 완료 (2026-07-04)**
   - 이제 `.env`의 `STOP_LOSS_PERCENT` 값을 사용

### 적용 범위

- ✅ 한국 주식 (`k_stocks`)
- ✅ 미국 주식 (`us_stocks`)
- ✅ 한국투자증권 선물 (`futures`)
- ✅ **바이낸스 선물** (`binance_futures`)

모든 마켓에서 동일한 전략 설정을 공유합니다.

## 향후 개선사항

1. ~~**WebSocket 실시간 데이터**~~ ✅ 완료
   - ~~지금: REST API (폴링)~~
   - ~~개선: WebSocket (push)~~ → **구현 완료!**

2. ~~**손절 전략 환경변수 통합**~~ ✅ 완료
   - ~~문제: 동적 손절이 하드코딩된 5% 사용~~
   - ~~개선: .env의 STOP_LOSS_PERCENT 사용~~ → **수정 완료 (2026-07-04)**

3. **더 많은 심볼**
   - 인기 암호화폐 추가 (BTC, ETH 등)
   - 추가 토큰화 주식

4. **거래 기능**
   - 주문 생성
   - 포지션 관리
   - 자동 매매

5. **펀딩 비율 표시**
   - Perpetual 특성상 펀딩 비율 중요

## 참고 자료

- [Binance Futures API 문서](https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info)
- [바이낸스 bStocks 출시](https://www.prnewswire.com/news-releases/binance-launches-us-stocks-trading-and-previews-bstocks-tokenized-securities-302787226.html)
- [TSLAUSDT Perpetual](https://www.binance.com/en/support/announcement/detail/40c76b4deaa247f09774e5d1ee747cb8)
