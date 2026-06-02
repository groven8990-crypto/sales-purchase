# 매입 자동화 Apps Script 설치 가이드

## 파일 구성

| 파일 | 역할 |
|------|------|
| `Config.gs` | 폴더 ID, 스토어 매핑 등 설정값 |
| `Utils.gs` | 공통 유틸리티 함수 |
| `FoodAndBest.gs` | 푸드엔드베스트 발주↔정산 대조 |
| `Ilbi.gs` | 일비 매입/B2B매출 분리 |
| `OtherVendors.gs` | 해담별·디네트 범용 파서 |
| `Main.gs` | 메인 실행 함수, 메뉴 등록 |

---

## 설치 방법

### 1단계: Apps Script 프로젝트 생성

1. Google Drive에서 **새 Google 스프레드시트** 생성
2. 상단 메뉴 → **확장 프로그램** → **Apps Script**
3. 기본으로 있는 `코드.gs` 파일 삭제

### 2단계: 파일 붙여넣기

아래 파일들을 순서대로 Apps Script에 추가:

1. **파일 추가** (+) 클릭 → 스크립트 선택
2. 파일명 입력 후 해당 `.gs` 파일 내용 복사·붙여넣기

추가 순서:
```
Config.gs → Utils.gs → FoodAndBest.gs → Ilbi.gs → OtherVendors.gs → Main.gs
```

### 3단계: Drive API 활성화

Apps Script 편집기 좌측 → **서비스(+)** → **Google Drive API v3** 추가

### 4단계: 출력 스프레드시트 ID 설정

`Config.gs`의 `OUTPUT_SHEET_ID` 에 **1단계에서 만든 스프레드시트 ID** 입력:

```javascript
OUTPUT_SHEET_ID: "여기에_스프레드시트_ID_입력",
```

스프레드시트 ID는 URL에서 확인:
`https://docs.google.com/spreadsheets/d/[이부분]/edit`

### 5단계: 권한 허용

1. Apps Script에서 **실행** → `runMay2026` 선택 후 실행
2. "권한 검토" 창 → Google 계정 선택 → 허용

---

## 사용 방법

### 방법 A: 스프레드시트 메뉴 이용

스프레드시트가 열리면 상단에 **🧾 매입 마감** 메뉴 자동 생성:

| 메뉴 항목 | 설명 |
|-----------|------|
| ▶ 이번 달 마감 실행 | 현재 달 기준 자동 처리 |
| ▶ 2026년 5월 실행 (테스트) | 5월 데이터로 테스트 |
| 📥 마감앱용 Excel 내보내기 | 마감 웹앱에 올릴 xlsx 생성 |

### 방법 B: Apps Script 편집기에서 직접 실행

```javascript
runMonthlyClosing("2605")  // 2026년 5월
runMonthlyClosing("2606")  // 2026년 6월
```

---

## 결과 시트 설명

| 시트 | 내용 |
|------|------|
| **요약** | 건수·금액 합계, 불일치 항목 수 |
| **매입내역** | 전 거래처 매입 (마감앱 import용) |
| **B2B매출** | 현해랑 주문분 (그로븐 B2B 매출) |
| **발주↔정산대조** | 발주서와 정산서 수량 비교 결과 |
| **실행로그** | 처리 내용·오류 기록 |

### 대조결과 색상

| 표시 | 의미 |
|------|------|
| ✅ | 발주·정산 수량 일치 |
| 🔴 수량불일치 | 발주N팩 → 정산M팩 (다름) |
| ⚠️ 발주서없음 | 정산서에만 있고 발주서 없음 |
| ⚠️ 정산서없음 | 발주서에만 있고 정산서 없음 |

---

## 마감앱 연동 방법

1. Apps Script에서 **📥 마감앱용 Excel 내보내기** 실행
2. 드라이브에 `장부_매입내역_YYMMDD.xlsx` 파일 생성됨
3. 마감 웹앱 → **매입 탭** → **엑셀 가져오기** → 해당 파일 업로드

---

## 드라이브 폴더 구조 (현재 설정)

```
발주관리/
  └─ 푸드엔드베스트/  (BALJOO_FOOD)
  └─ 일비/           (BALJOO_ILBI)

재무관리/
  └─ 정산서/
       └─ 푸드엔 거래내역서/  (FOOD_JUNGSAN)
       └─ 일비 정산서/        (ILBI_JUNGSAN)
       └─ 해담별/             (HAEDAMBYUL)
       └─ 디네트/             (DINET)
```

파일명은 반드시 **YYMMDD-** 로 시작해야 자동 인식됩니다.
예: `260515-푸드엔드베스트_정산서.xlsx`

---

## 해담별·디네트 파서 커스터마이징

`OtherVendors.gs`의 `parseGenericJungsan`은 범용 파서입니다.
실제 정산서 파일을 확인한 후 `FoodAndBest.gs`처럼 전용 파서 작성을 권장합니다.

새 거래처 추가 시:
1. `OtherVendors.gs`에 `processNewVendor()` 함수 추가
2. `Main.gs`의 `runMonthlyClosing()`에서 호출 추가
3. `Config.gs`에 폴더 ID 추가
