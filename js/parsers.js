/* =============================================================
 *  parsers.js — 엑셀/파일 읽기 및 자동 정리
 *   - 기존 그로븐/YB 마감 엑셀 가져오기
 *   - 기업은행 통장 거래내역 → 입금/출금 자동 분류
 *   - 발주서(양식 다양) → 열 매칭형 유연 가져오기
 * ============================================================= */

const Parsers = (function () {
  const num = (v) => {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return v;
    const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : 0;
  };

  // 셀 값을 문자열로
  const str = (v) => (v == null ? "" : String(v).trim());

  // 날짜 → {y,m,d}
  function parseDate(v) {
    if (v instanceof Date) return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
    const s = str(v);
    let mt = s.match(/(\d{4})[.\-\/년\s]+(\d{1,2})[.\-\/월\s]+(\d{1,2})/);
    if (mt) return { y: +mt[1], m: +mt[2], d: +mt[3] };
    mt = s.match(/(\d{1,2})[.\-\/월\s]+(\d{1,2})/);
    if (mt) return { y: null, m: +mt[1], d: +mt[2] };
    return { y: null, m: null, d: null };
  }

  /* ---- 워크북 읽기 ---------------------------------------- */
  async function readWorkbook(file) {
    const buf = await file.arrayBuffer();
    return XLSX.read(buf, { type: "array", cellDates: true });
  }

  function sheetToRows(ws) {
    return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
  }

  /* =========================================================
   *  1) 기존 그로븐/YB 마감 엑셀 가져오기
   *     매출 / 매입 / 입출금 / Sheet1(송금처) 시트를 인식
   * ========================================================= */
  async function importExistingWorkbook(file, store) {
    const wb = await readWorkbook(file);
    const out = { sales: [], purchases: [], transactions: [], vendors: [] };

    const findSheet = (names) =>
      wb.SheetNames.find((n) => names.some((k) => n.replace(/\s/g, "").includes(k)));

    // --- 매출 (헤더 기반 열 인식: 그로븐/YB 레이아웃 모두 대응) ---
    const sName = findSheet(["매출"]);
    if (sName) {
      const rows = sheetToRows(wb.Sheets[sName]);
      const hi = rows.findIndex((r) => (r || []).some((c) => str(c).includes("주문")) &&
        (r || []).some((c) => str(c).includes("채널")));
      const hdr = rows[hi] || [];
      const col = (keys) => hdr.findIndex((c) => { const h = str(c).replace(/\s/g, ""); return keys.some((k) => h.includes(k)); });
      const cYear = col(["년"]), cMonth = col(["월"]), cChannel = col(["채널"]),
        cTax = col(["구분"]), cDesc = col(["내용"]), cOrders = col(["주문", "건수"]),
        cSupply = col(["공급가", "매출액"]), cVat = col(["세액"]), cTotal = col(["합계"]),
        cSettle = col(["정산여부"]);
      for (let i = hi + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const year = num(r[cYear]); const month = num(r[cMonth]);
        const channel = str(r[cChannel]);
        if (!channel || (!year && !month)) continue;
        let taxClass = cTax >= 0 ? str(r[cTax]) : "";
        if (taxClass !== "면세" && taxClass !== "과세") taxClass = store === "groven" ? "면세" : "과세";
        const supply = num(r[cSupply]);
        const vat = cVat >= 0 ? num(r[cVat]) : 0;
        const total = cTotal >= 0 ? (num(r[cTotal]) || supply) : supply;
        out.sales.push({ store, year, month, channel, taxClass,
          desc: cDesc >= 0 ? str(r[cDesc]) : "", orders: num(r[cOrders]),
          supply, vat, total, settled: cSettle >= 0 ? str(r[cSettle]) : "" });
      }
    }

    // --- 매입 ---
    const pName = wb.SheetNames.find((n) => n.replace(/\s/g, "") === "매입") || findSheet(["매입"]);
    if (pName) {
      const rows = sheetToRows(wb.Sheets[pName]);
      const hi = rows.findIndex((r) => (r || []).some((c) => str(c) === "증  빙" || str(c).replace(/\s/g,"") === "증빙"));
      for (let i = hi + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const year = num(r[0]); const month = num(r[1]);
        const vendor = str(r[6]); const supply = num(r[7]);
        if (!vendor && !supply) continue;
        out.purchases.push({
          store, year, month, day: num(r[2]),
          evidence: str(r[3]), category: str(r[4]) || "상품매입",
          desc: str(r[5]).replace(/\t/g, " ").trim(), vendor,
          supply, vat: num(r[8]), total: num(r[9]) || supply,
          orders: num(r[10]), paid: str(r[12]), note: str(r[13]),
        });
      }
    }

    // --- 입출금 ---
    const tName = findSheet(["입출금"]);
    if (tName) {
      const rows = sheetToRows(wb.Sheets[tName]);
      const hi = rows.findIndex((r) => (r || []).some((c) => str(c).replace(/\s/g,"") === "증빙"));
      for (let i = hi + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const year = num(r[0]); const month = num(r[1]);
        const desc = str(r[5]); const cp = str(r[6]); const amt = num(r[7]);
        if (!desc && !cp && !amt) continue;
        out.transactions.push({
          store, year, month, day: num(r[2]),
          type: "in", evidence: str(r[3]), category: str(r[4]) || "매출정산",
          desc, counterparty: cp, amount: amt, vat: num(r[8]),
          total: num(r[9]) || amt, bank: str(r[10]), account: str(r[11]),
          note: str(r[13]),
        });
      }
    }

    // --- 송금처 마스터 (Sheet1) ---
    const vName = wb.SheetNames.find((n) => /sheet1/i.test(n)) || findSheet(["송금처", "거래처"]);
    if (vName) {
      const rows = sheetToRows(wb.Sheets[vName]);
      rows.forEach((r) => {
        const name = str(r[0]);
        if (!name || name === "송금처") return;
        out.vendors.push({ name, bank: str(r[1]), account: str(r[2]) });
      });
    }
    return out;
  }

  /* =========================================================
   *  2) 기업은행(IBK) 통장 거래내역 자동 분류
   *     헤더를 키워드로 탐지 → 입금/출금 분리
   * ========================================================= */
  const COLMAP = {
    date: ["거래일자", "거래일시", "거래일", "일자", "거래일자시간"],
    out: ["출금", "찾으신금액", "지급", "출금금액", "출금액"],
    in: ["입금", "맡기신금액", "받으신", "입금금액", "입금액"],
    amount: ["거래금액", "금액"],
    flag: ["입출금구분", "입출구분"],
    balance: ["거래후잔액", "잔액"],
    desc: ["적요", "거래내용", "내용", "기재내용", "거래기록사항", "통장표시내용"],
    counterparty: ["상대계좌예금주", "보내는분", "받는분", "의뢰인", "입금자", "거래처", "이체메모", "받는통장표시"],
    bank: ["상대은행", "거래은행"],
    account: ["상대계좌번호", "계좌번호"],
    memo: ["메모", "비고"],
  };

  function detectColumns(headerRow) {
    const idx = {};
    headerRow.forEach((cell, i) => {
      const h = str(cell).replace(/\s/g, "");
      for (const [field, keys] of Object.entries(COLMAP)) {
        if (idx[field] != null) continue;
        if (keys.some((k) => h.includes(k.replace(/\s/g, "")))) idx[field] = i;
      }
    });
    return idx;
  }

  // 헤더 = 짧은 라벨 셀이 여러 개 매칭되는 행 (안내문 블록 오인 방지)
  function findHeaderRow(rows) {
    let best = -1, bi = 0;
    const allKeys = Object.values(COLMAP).flat().map((k) => k.replace(/\s/g, ""));
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const r = rows[i] || [];
      let score = 0;
      r.forEach((c) => {
        const h = str(c).replace(/\s/g, "");
        if (!h || h.length > 12) return; // 긴 안내문 셀은 라벨로 보지 않음
        if (allKeys.some((k) => h === k || h.includes(k))) score++;
      });
      if (score > best) { best = score; bi = i; }
    }
    return best >= 3 ? bi : 0;
  }

  // 통장내역 → 미리보기용 표준 거래행 배열
  async function parseBankStatement(file, store) {
    const wb = await readWorkbook(file);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = sheetToRows(ws);
    const hi = findHeaderRow(rows);
    const idx = detectColumns(rows[hi] || []);
    const txns = [];

    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      if (r.every((c) => c == null || c === "")) continue;

      const d = parseDate(r[idx.date]);
      // 날짜가 없는 행(합계/소계 등 요약 행)은 건너뜀
      if (d.m == null && d.y == null) continue;

      const descRaw = str(r[idx.desc]);
      const cp = str(r[idx.counterparty]); // 상대계좌예금주명(더 정확)
      const desc = descRaw || cp;
      let amount = 0, type = null;

      if (idx.out != null || idx.in != null) {
        const outV = num(r[idx.out]); const inV = num(r[idx.in]);
        if (inV > 0) { amount = inV; type = "in"; }
        else if (outV > 0) { amount = outV; type = "out"; }
      } else if (idx.amount != null) {
        const a = num(r[idx.amount]);
        const flag = str(r[idx.flag]);
        if (/입금|입/.test(flag)) { amount = Math.abs(a); type = "in"; }
        else if (/출금|출/.test(flag)) { amount = Math.abs(a); type = "out"; }
        else { type = a >= 0 ? "in" : "out"; amount = Math.abs(a); }
      }
      if (!amount || !type) continue;

      // 거래내용 우선, 없으면 거래처로 분류
      const rule = SPC.classifyTxn(descRaw, cp, type);
      const vendor = SPC.lookupVendor(cp) || SPC.lookupVendor(descRaw);
      // 상대은행/계좌(출금 시 받는 곳) → 없으면 송금처 마스터
      const stmtBank = idx.bank != null ? str(r[idx.bank]) : "";
      const stmtAcct = idx.account != null ? str(r[idx.account]) : "";
      txns.push({
        store,
        year: d.y || new Date().getFullYear(), month: d.m, day: d.d,
        type,
        evidence: type === "in" ? "통장입금증" : "",
        category: rule.category,
        channel: rule.channel || "",
        desc, counterparty: cp || desc,
        amount, vat: 0, total: amount,
        bank: stmtBank || (vendor ? vendor.bank : ""),
        account: stmtAcct || (vendor ? vendor.account : ""),
        balance: num(r[idx.balance]),
        note: str(r[idx.memo]),
      });
    }
    return { txns, mapping: idx, headerRow: rows[hi] || [] };
  }

  /* =========================================================
   *  3) 발주서(양식 다양) — 열 매칭형 유연 가져오기
   *     모든 열 헤더를 돌려주고, 사용자가 매핑을 고르게 함
   * ========================================================= */
  async function readGenericTable(file) {
    const wb = await readWorkbook(file);
    // 데이터가 가장 많은 시트 선택 (빈 '시트1' 같은 건 건너뜀)
    let rows = [], bestCount = -1;
    wb.SheetNames.forEach((name) => {
      const r = sheetToRows(wb.Sheets[name]).filter((row) => row && row.some((c) => c != null && c !== ""));
      if (r.length > bestCount) { bestCount = r.length; rows = r; }
    });
    // 헤더 후보: 가장 많은 채워진 칸을 가진 상위 행
    let hi = 0, best = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const filled = (rows[i] || []).filter((c) => c != null && c !== "").length;
      if (filled > best) { best = filled; hi = i; }
    }
    const headers = (rows[hi] || []).map((c, i) => ({ index: i, name: str(c) || `열${i + 1}` }));
    const body = rows.slice(hi + 1);
    return { headers, body, sheetNames: wb.SheetNames };
  }

  // 매핑 {field: colIndex} 적용 → 매입행 생성
  function normStore(v) {
    v = String(v || "").toLowerCase();
    if (v.indexOf("yb") !== -1 || v.indexOf("옐") !== -1 || v.indexOf("과세") !== -1) return "yb";
    if (v.indexOf("grov") !== -1 || v.indexOf("그로") !== -1 || v.indexOf("면세") !== -1) return "groven";
    return "";
  }
  function applyPurchaseMapping(body, mapping, fixed) {
    const out = [];
    body.forEach((r) => {
      const get = (f) => (mapping[f] != null ? r[mapping[f]] : null);
      const rowStore = mapping.store != null ? normStore(get("store")) : "";
      const store = rowStore || fixed.store;
      const taxType = store === "yb" ? "과세" : "면세";
      const vendor = str(get("vendor")) || fixed.vendor || "";
      const desc = str(get("desc"));
      const qty = num(get("qty"));
      let supply = num(get("supply"));
      const total = num(get("total"));
      if (!supply && total) supply = taxType === "과세" ? Math.round(total / 1.1) : total;
      if (!vendor && !desc && !supply && !total) return;
      const d = parseDate(get("date"));
      const vat = taxType === "과세" ? (num(get("vat")) || (total ? total - supply : Math.round(supply * 0.1))) : 0;
      out.push({
        store: store,
        year: d.y || fixed.year, month: d.m || fixed.month, day: d.d || fixed.day || "",
        evidence: fixed.evidence || "계산서",
        category: fixed.category || "상품매입",
        desc: desc || (vendor ? vendor + " 발주 건" : "발주 건"),
        vendor, supply, vat, total: total || supply + vat,
        orders: qty || 1, paid: "", note: "발주서",
      });
    });
    return out;
  }

  return {
    num, str, parseDate,
    importExistingWorkbook,
    parseBankStatement,
    readGenericTable,
    applyPurchaseMapping,
    COLMAP,
  };
})();
