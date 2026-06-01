/* =============================================================
 *  report.js — 월 마감 보고서 엑셀(.xlsx) 생성/다운로드
 *  표는 모두 금액 큰 것부터 정렬, 스토어별/통합 시트 구성
 * ============================================================= */

const Report = (function () {
  const S = SPC;
  const num = S.num;

  function aoaSheet(aoa) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // 숫자 천단위 서식
    return ws;
  }

  function buildWorkbook({ year, month }) {
    const wb = XLSX.utils.book_new();
    const scopeLabel = (year ? year + "년 " : "") + (month ? month + "월 " : "");

    // ---- 요약 시트 ----
    const summaryAoa = [[`${scopeLabel}매입·매출 마감 보고서`], [`생성일: ${new Date().toLocaleString("ko-KR")}`], []];
    summaryAoa.push(["스토어", "구분", "매출(공급가)", "매입(공급가)", "손익", "매출건수", "매입건수"]);
    ["groven", "yb"].forEach((st) => {
      const sl = S.filterBy(S.data.sales, { store: st, year, month });
      const pl = S.filterBy(S.data.purchases, { store: st, year, month });
      const sv = S.sum(sl, "supply") || S.sum(sl, "total");
      const pv = S.sum(pl, "supply") || S.sum(pl, "total");
      summaryAoa.push([S.STORES[st].name, S.STORES[st].taxType, sv, pv, sv - pv, sl.length, pl.length]);
    });
    XLSX.utils.book_append_sheet(wb, aoaSheet(summaryAoa), "요약");

    // ---- 스토어별 매출/매입/입출금 ----
    ["groven", "yb"].forEach((st) => {
      const nm = S.STORES[st].name;

      // 매출 (금액 큰 것부터)
      const sl = S.byAmountDesc(S.filterBy(S.data.sales, { store: st, year, month }), "supply");
      const sAoa = [["순번", "년", "월", "채널", "구분", "내용", "주문건수", "공급가액", "세액", "합계", "정산여부"]];
      sl.forEach((r, i) => sAoa.push([i + 1, r.year, r.month, r.channel, r.taxClass, r.desc,
        num(r.orders), num(r.supply), num(r.vat), num(r.total) || num(r.supply), r.settled || ""]));
      XLSX.utils.book_append_sheet(wb, aoaSheet(sAoa), `${nm}_매출`.slice(0, 31));

      // 매입 (금액 큰 것부터)
      const pl = S.byAmountDesc(S.filterBy(S.data.purchases, { store: st, year, month }), "supply");
      const pAoa = [["순번", "년", "월", "일", "증빙", "분류", "내용", "업체명", "공급가", "세액", "합계", "주문건수", "결제여부"]];
      pl.forEach((r, i) => pAoa.push([i + 1, r.year, r.month, r.day, r.evidence, r.category, r.desc,
        r.vendor, num(r.supply), num(r.vat), num(r.total) || num(r.supply), num(r.orders), r.paid || ""]));
      XLSX.utils.book_append_sheet(wb, aoaSheet(pAoa), `${nm}_매입`.slice(0, 31));

      // 입출금 (금액 큰 것부터)
      const tl = S.byAmountDesc(S.filterBy(S.data.transactions, { store: st, year, month }), "amount");
      const tAoa = [["순번", "년", "월", "일", "입출구분", "증빙", "분류", "내용", "거래처", "금액", "은행", "계좌번호", "비고"]];
      tl.forEach((r, i) => tAoa.push([i + 1, r.year, r.month, r.day, r.type === "in" ? "입금" : "출금",
        r.evidence, r.category, r.desc, r.counterparty, num(r.amount), r.bank, r.account, r.note || ""]));
      XLSX.utils.book_append_sheet(wb, aoaSheet(tAoa), `${nm}_입출금`.slice(0, 31));
    });

    // ---- 월별 재무현황 ----
    const finAoa = [["월별 재무현황 (통합)"], [], ["년", "월", "매출", "매입", "손익", "누적손익"]];
    S.monthlySummary("").forEach((r) => finAoa.push([r.y, r.m, r.sales, r.purchase, r.profit, r.cumulative]));
    XLSX.utils.book_append_sheet(wb, aoaSheet(finAoa), "재무현황");

    return wb;
  }

  function download({ year, month }) {
    const wb = buildWorkbook({ year, month });
    const name = `매입매출_마감보고서_${year || ""}${month ? "-" + month : ""}.xlsx`;
    XLSX.writeFile(wb, name);
  }

  return { buildWorkbook, download };
})();
