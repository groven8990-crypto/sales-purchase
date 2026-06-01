/* =============================================================
 *  store.js  —  데이터 모델 + 로컬 저장(localStorage)
 *  매출/매입/입출금 자료를 브라우저 안에 안전하게 보관합니다.
 *  (데이터는 외부로 전송되지 않고 이 브라우저에만 저장됩니다)
 * ============================================================= */

const SPC = (function () {
  const KEY = "spc_data_v2";

  /* ---- 상수 ------------------------------------------------ */
  const STORES = {
    groven: { name: "그로븐", taxType: "면세" },
    yb: { name: "옐로우브릿지", taxType: "과세" },
  };

  // 매입/지출 분류 (기존 엑셀 '보고용' 시트 기준)
  const CATEGORIES = [
    "상품매입", "원재료", "배송비", "수수료", "지급수수료",
    "소모품비", "복리후생", "외주비", "지급임차료", "광고비",
    "공과 외", "기타",
  ];

  // 증빙 종류
  const EVIDENCES = [
    "세금계산서", "계산서", "현금영수증", "카드내역서",
    "고지서", "영수증", "통장입금증", "현금", "기타",
  ];

  // 매출 채널
  const CHANNELS = ["쿠팡", "네이버", "11번가", "지마켓", "옥션", "카카오톡", "톡딜", "기타"];

  /* ---- 입출금 자동 분류 규칙 (기업은행 기준) -------------- */
  // 거래상대/적요에 keyword 가 포함되면 해당 분류를 적용.
  // type: 'in'(입금/매출정산) | 'out'(출금/매입·비용)
  const DEFAULT_RULES = [
    { kw: "네이버파이낸셜", type: "in", category: "매출정산", channel: "네이버" },
    { kw: "네이버", type: "in", category: "매출정산", channel: "네이버" },
    { kw: "카카오", type: "in", category: "매출정산", channel: "카카오톡" },
    { kw: "더즌", type: "in", category: "매출정산", channel: "카카오톡" },
    { kw: "쿠팡페이", type: "in", category: "매출정산", channel: "쿠팡" },
    { kw: "지마켓", type: "in", category: "매출정산", channel: "지마켓" },
    { kw: "이베이", type: "in", category: "매출정산", channel: "지마켓" },
    { kw: "11번가", type: "in", category: "매출정산", channel: "11번가" },
    { kw: "에스케이플래닛", type: "in", category: "매출정산", channel: "11번가" },
    { kw: "옥션", type: "in", category: "매출정산", channel: "옥션" },
    // 출금 성격 — 비용/매입
    { kw: "임대", type: "out", category: "지급임차료" },
    { kw: "임차", type: "out", category: "지급임차료" },
    { kw: "광고", type: "out", category: "광고비" },
    { kw: "수수료", type: "out", category: "지급수수료" },
    { kw: "도매꾹", type: "out", category: "상품매입" },
    { kw: "이머니", type: "out", category: "상품매입" },
  ];

  /* ---- 기본 데이터 ---------------------------------------- */
  function emptyData() {
    return {
      version: 2,
      updatedAt: null,
      stores: JSON.parse(JSON.stringify(STORES)),
      sales: [],        // 매출
      purchases: [],    // 매입
      transactions: [], // 입출금
      vendors: [],      // 송금처 마스터 {name, bank, account}
      rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
    };
  }

  let data = load();

  /* ---- 영속화 --------------------------------------------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(emptyData(), JSON.parse(raw));
    } catch (e) {
      console.warn("저장된 데이터를 읽지 못했습니다:", e);
    }
    return emptyData();
  }

  function save() {
    data.updatedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(data));
    document.dispatchEvent(new CustomEvent("spc:changed"));
  }

  /* ---- ID ------------------------------------------------- */
  let _seq = Date.now();
  function uid() { return "r" + (_seq++).toString(36); }

  /* ---- 조회/필터 ------------------------------------------ */
  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

  // 금액 큰 것부터 정렬 (사용자 요구사항: 순번은 무조건 큰 것부터)
  function byAmountDesc(arr, field) {
    return [...arr].sort((a, b) => num(b[field]) - num(a[field]));
  }

  function filterBy(arr, { store, year, month } = {}) {
    return arr.filter((r) =>
      (store ? r.store === store : true) &&
      (year ? num(r.year) === num(year) : true) &&
      (month ? num(r.month) === num(month) : true)
    );
  }

  /* ---- CRUD ----------------------------------------------- */
  function addSales(rows) { rows.forEach((r) => data.sales.push(Object.assign({ id: uid() }, r))); save(); }
  function addPurchases(rows) { rows.forEach((r) => data.purchases.push(Object.assign({ id: uid() }, r))); save(); }
  function addTransactions(rows) { rows.forEach((r) => data.transactions.push(Object.assign({ id: uid() }, r))); save(); }

  function upsertVendor(v) {
    if (!v || !v.name) return;
    const ex = data.vendors.find((x) => x.name === v.name);
    if (ex) Object.assign(ex, v); else data.vendors.push(v);
  }

  function remove(kind, id) {
    if (!data[kind]) return;
    data[kind] = data[kind].filter((r) => r.id !== id);
    save();
  }

  function update(kind, id, patch) {
    const r = (data[kind] || []).find((x) => x.id === id);
    if (r) { Object.assign(r, patch); save(); }
  }

  function clearAll() { data = emptyData(); save(); }

  /* ---- 집계 ----------------------------------------------- */
  // 월별 매출/매입 합계 (공급가 기준) 및 손익
  function monthlySummary(store) {
    const map = {}; // "YYYY-M" -> {sales, purchase}
    const key = (y, m) => `${y}-${m}`;
    filterBy(data.sales, { store }).forEach((r) => {
      const k = key(r.year, r.month);
      (map[k] = map[k] || { y: num(r.year), m: num(r.month), sales: 0, purchase: 0 }).sales += num(r.supply || r.total);
    });
    filterBy(data.purchases, { store }).forEach((r) => {
      const k = key(r.year, r.month);
      (map[k] = map[k] || { y: num(r.year), m: num(r.month), sales: 0, purchase: 0 }).purchase += num(r.supply || r.total);
    });
    const rows = Object.values(map).sort((a, b) => a.y - b.y || a.m - b.m);
    let cum = 0;
    rows.forEach((r) => { r.profit = r.sales - r.purchase; cum += r.profit; r.cumulative = cum; });
    return rows;
  }

  function sum(arr, field) { return arr.reduce((s, r) => s + num(r[field]), 0); }

  /* ---- 자동 분류 적용 ------------------------------------- */
  function classify(text, amountType) {
    // amountType: 'in' | 'out' (입금/출금 — 금액 부호로 먼저 판단)
    const t = String(text || "");
    for (const rule of data.rules) {
      if (t.includes(rule.kw)) {
        if (rule.type === amountType || amountType == null) return rule;
      }
    }
    // 매칭 안되면 기본값
    if (amountType === "in") return { type: "in", category: "매출정산", channel: "기타" };
    return { type: "out", category: "기타" };
  }

  function lookupVendor(name) {
    if (!name) return null;
    return data.vendors.find((v) => name.includes(v.name) || v.name.includes(name)) || null;
  }

  /* ---- 공개 API ------------------------------------------- */
  return {
    KEY, STORES, CATEGORIES, EVIDENCES, CHANNELS,
    get data() { return data; },
    save, load, uid, num, byAmountDesc, filterBy,
    addSales, addPurchases, addTransactions, upsertVendor,
    remove, update, clearAll,
    monthlySummary, sum, classify, lookupVendor,
    emptyData,
    exportJSON() { return JSON.stringify(data, null, 2); },
    importJSON(json) { data = Object.assign(emptyData(), JSON.parse(json)); save(); },
  };
})();
