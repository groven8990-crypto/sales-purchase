// ===== 설정 =====
// 이 파일의 값만 수정하면 됩니다.

var CONFIG = {
  // 출력 스프레드시트 ID (새로 만들면 URL에서 복사)
  // 비워두면 스크립트 실행 시 자동 생성
  OUTPUT_SHEET_ID: "",

  // 드라이브 폴더 ID
  FOLDER: {
    BALJOO_ROOT:   "1WM_a0aP3DE5motU7UC6F83xiVL2Cwhdw",  // 발주관리
    BALJOO_FOOD:   "1k--9pdo6xvgudwsFr4gWDorCYt7BLpFN",  // 푸드엔드베스트 발주
    BALJOO_ILBI:   "17EBW_keARXJ7ZADq7GjOKxQtQSbT78wR",  // 일비 발주
    JUNGSAN_ROOT:  "17cOKQmHT5_Si-GRSuw-PxNof_4jB9vzh",  // 재무관리/정산서
    FOOD_JUNGSAN:  "1EBES-zBsu9NVgi_dV2kguC4KmZ8r_bGb",  // 푸드엔 거래내역서
    ILBI_JUNGSAN:  "1CdexzQ1dPKTBnr_5oAX1KvOSrZBuX683",  // 일비 정산서
    HAEDAMBYUL:    "1x2BG4oBY38M3u6JuffszYDv1oVsYjWkF",  // 해담별 정산서
    DINET:         "10JCfWBzPz7w6lLzol_q-YTXARYdrr7Rk",  // 디네트 정산서
  },

  // 스토어 매핑 (발주서 '보내는분' → store 코드)
  STORE_MAP: {
    "로또상회": "groven",
    "자꾸가게": "yb",
    "그로븐":   "groven",
    "옐로우브릿지": "yb",
    "YB":       "yb",
  },

  // 일비 정산서: 주문자명 → 구분
  // 현해랑으로 주문된 건 = B2B 매출 (그로븐)
  ILBI_B2B_BUYER: ["현해랑"],

  // 마감앱 import 호환 헤더
  OUTPUT_HEADERS: [
    "날짜", "거래처", "분류", "품목", "규격", "수량", "단가",
    "공급가", "부가세", "합계", "스토어", "메모", "대조결과", "원본파일"
  ],

  // 출력 시트 이름
  SHEET_PURCHASE: "매입내역",
  SHEET_B2B_SALES: "B2B매출",
  SHEET_COMPARE:  "발주↔정산대조",
  SHEET_LOG:      "실행로그",
};
