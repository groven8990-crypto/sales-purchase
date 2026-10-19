# 매입·매출 마감 시스템 — 작업 지침

## 사용자 선호 (꼭 기억할 것)
- **차트 색상은 파스텔톤(연한 색)으로.** 진한 원색 금지.
  - 공용 팔레트: `js/dashboard.js`의 `PALETTE` (파스텔). 새 차트도 이 팔레트 계열 사용.
  - 통합 수기 보고서 플랫폼 도넛: `js/app.js`의 인라인 `PAL`도 동일 파스텔.
- **사업장 표기**: 옐로우브릿지는 화면에서 **YB**로 (약칭 "옐브" 쓰지 않기). 정식 명칭 "옐로우브릿지"는 보고서 제목 등 격식 있는 곳에만.
- **데이터 저장**: 입력은 자동 저장(저장 버튼 없음). 수기 보고서 입력 중에는 `S.save(true)`(silent)로 저장해 전역 재렌더(스크롤 튐) 방지.
- **마진율** 사용(= 손익/매출). '원가율'(매입/매출)은 쓰지 않음.

## 구조 메모
- 정적 웹앱(GitHub Pages), localStorage(`spc_data_v2`). 서버 없음.
- 배포 브랜치: `claude/beautiful-wright-jKLFp` (.github/workflows/pages.yml)
- 주소: https://groven8990-crypto.github.io/sales-purchase/
- 두 사업장: 그로븐(면세) / 옐로우브릿지=YB(과세)
