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
    { kw: "스마트스토어", type: "in", category: "매출정산", channel: "네이버" },
    { kw: "토스", type: "in", category: "매출정산", channel: "기타" },
    { kw: "위메프", type: "in", category: "매출정산", channel: "기타" },
    { kw: "티몬", type: "in", category: "매출정산", channel: "기타" },
    // 출금 성격 — 비용/매입
    { kw: "임대", type: "out", category: "지급임차료" },
    { kw: "임차", type: "out", category: "지급임차료" },
    { kw: "광고", type: "out", category: "광고비" },
    { kw: "수수료", type: "out", category: "지급수수료" },
    { kw: "도매꾹", type: "out", category: "상품매입" },
    { kw: "이머니", type: "out", category: "상품매입" },
    // 매입 거래처 (출금 → 상품매입)
    { kw: "해담별", type: "out", category: "상품매입" },
    { kw: "일비", type: "out", category: "상품매입" },
    { kw: "푸드엔", type: "out", category: "상품매입" },
    { kw: "디네트", type: "out", category: "상품매입" },
    { kw: "생선상륙", type: "out", category: "상품매입" },
    { kw: "공덕농협", type: "out", category: "상품매입" },
    { kw: "다모아", type: "out", category: "상품매입" },
    { kw: "한마당", type: "out", category: "상품매입" },
    { kw: "일해수산", type: "out", category: "상품매입" },
    { kw: "충남마른김", type: "out", category: "상품매입" },
    { kw: "거풍푸드", type: "out", category: "상품매입" },
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
      if (raw) {
        const d = Object.assign(emptyData(), JSON.parse(raw));
        // 새로 추가된 기본 규칙을 기존 데이터에도 보충 (학습 규칙은 그대로 유지)
        if (!d.rules) d.rules = [];
        DEFAULT_RULES.forEach((dr) => {
          if (!d.rules.some((r) => r.kw === dr.kw && r.type === dr.type)) d.rules.push(dr);
        });
        return d;
      }
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
  function clearKind(kind) { if (data[kind]) { data[kind] = []; save(); } }

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

  // 특정 필드(채널/업체 등)로 묶어 건수·금액 합계 → 금액 큰 순 정렬
  function groupSum(arr, keyField, valField) {
    const m = {};
    arr.forEach((r) => {
      const k = (r[keyField] != null && r[keyField] !== "") ? r[keyField] : "(미지정)";
      (m[k] = m[k] || { key: k, count: 0, sum: 0 });
      m[k].count += 1; m[k].sum += num(r[valField]);
    });
    const rows = Object.values(m).sort((a, b) => b.sum - a.sum);
    const total = rows.reduce((s, r) => s + r.sum, 0) || 1;
    rows.forEach((r) => { r.ratio = r.sum / total; });
    return rows;
  }

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

  // 거래내용(desc)을 우선, 없으면 거래처(cp)로 분류. 매칭 여부도 반환.
  function classifyTxn(desc, cp, type) {
    const tryText = (t) => {
      const s = String(t || "");
      for (const r of data.rules) { if (r.type === type && s.includes(r.kw)) return r; }
      return null;
    };
    const r = tryText(desc) || tryText(cp);
    if (r) return { category: r.category, channel: r.channel || "", matched: true };
    if (type === "in") return { category: "매출정산", channel: "기타", matched: false };
    const v = lookupVendor(cp) || lookupVendor(desc); // 출금: 송금처 매칭되면 상품매입으로
    return { category: v ? "상품매입" : "기타", channel: "", matched: false };
  }

  // 사용자가 정한 분류를 규칙으로 기억 → 다음 업로드 때 자동 적용
  function learnRule(text, type, category, channel) {
    const kw = String(text || "").trim();
    if (!kw || kw.length < 2 || !category || category === "기타") return;
    const ex = data.rules.find((r) => r.type === type && r.kw === kw);
    if (ex) { ex.category = category; if (channel) ex.channel = channel; }
    else data.rules.push({ kw, type, category, channel: channel || "", learned: true });
    save();
  }

  /* ---- 공개 API ------------------------------------------- */
  return {
    KEY, STORES, CATEGORIES, EVIDENCES, CHANNELS,
    get data() { return data; },
    save, load, uid, num, byAmountDesc, filterBy,
    addSales, addPurchases, addTransactions, upsertVendor,
    remove, update, clearAll, clearKind,
    monthlySummary, sum, groupSum, classify, classifyTxn, learnRule, lookupVendor,
    emptyData,
    exportJSON() { return JSON.stringify(data, null, 2); },
    importJSON(json) { data = Object.assign(emptyData(), JSON.parse(json)); save(); },
  };
})();
