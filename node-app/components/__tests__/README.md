# 컴포넌트 테스트

이 폴더에는 화면 UX와 관련된 컴포넌트 테스트가 포함되어 있습니다.

## 테스트 환경 설정

### 1. 필요한 패키지 설치

```bash
npm install --save-dev \
  jest \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  jest-environment-jsdom \
  @testing-library/react-hooks
```

### 2. package.json에 테스트 스크립트 추가

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

## 테스트 실행

### 모든 테스트 실행

```bash
npm test
```

### 특정 파일만 테스트

```bash
npm test StockChartDisplay
```

### Watch 모드로 실행 (파일 변경 감지)

```bash
npm run test:watch
```

### 커버리지 리포트 생성

```bash
npm run test:coverage
```

## 테스트 구조

### components/**tests**/

- `StockChartDisplay.test.tsx` - 차트 리사이징 및 높이 계산 테스트
- `ChartPanel.test.tsx` - Flexbox 레이아웃 및 반응형 테스트
- `StockLayout.test.tsx` - 사이드바 토글 및 레이아웃 테스트

### components/charts/**tests**/

- `MainChart.test.tsx` - 메인 차트 autoSize 및 리사이징 테스트
- `RsiChart.test.tsx` - RSI 차트 및 상태 표시 테스트
- `MacdChart.test.tsx` - MACD 차트 및 모멘텀 표시 테스트
- `PivotChart.test.tsx` - Pivot 라인 표시 테스트

## 주요 테스트 항목

### 1. 차트 리사이징 UX

- ✅ 브라우저 높이 변경 시 차트 높이 동적 조정
- ✅ 사이드바 펼침/접힘 시 차트 너비 동적 조정
- ✅ ResizeObserver를 통한 자동 감지
- ✅ autoSize: true 옵션 설정

### 2. Flexbox 레이아웃

- ✅ flex-1 클래스 적용
- ✅ min-w-0, min-h-0 적용 (content 크기보다 작아질 수 있도록)
- ✅ flex-shrink-0 적용 (차트가 축소되지 않도록)
- ✅ 명시적 높이 설정

### 3. 차트 캔들 굵기 일관성

- ✅ fitContent() 호출하지 않음 (고정 visible bars 유지)
- ✅ 화면 크기별 고정 캔들 개수 (60, 50, 45, 40, 30)

### 4. 차트 상태 표시

- ✅ RSI 과매수/과매도 태그 표시
- ✅ MACD 모멘텀 상태 표시
- ✅ 적절한 색상 코딩

### 5. 사이드바 토글

- ✅ 접기/펼치기 상태 관리
- ✅ 차트 영역 자동 리사이징

## 참고 사항

- 모든 테스트는 EC2 서버에서 실행하지 않고 로컬에서만 실행됩니다
- lightweight-charts는 모킹되어 있어 실제 차트를 렌더링하지 않습니다
- 테스트는 UX 동작을 검증하며, 실제 차트 렌더링은 E2E 테스트에서 수행해야 합니다
