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
      vendorItems: {},  // 매입처별 취급품목 { 매입처명: "취급품목" }
      vendorAlias: {},  // 사용자 정의 거래처 별칭 { 별칭: 대표이름 }
      evidence: {},     // 홈택스 증빙 대조 { "YYYY-M": [{store,type,supply,vat,total}] }
      deposits: [],     // 예치금 입출 { id, vendor, date, kind:'충전'|'사용', amount, memo }
      orders: [],       // 발주내역 { id, store, year, month, day, vendor, desc, qty, note }
      manualReport: {}, // 수기 마감보고서 { "YYYY-M": {...} }
      fixedCosts: [],   // 고정비/정기결제 (매월 자동) { id, store, vendor, note, count, amount }
      cs: [],           // C/S 관리 { id, date, store, channel, orderNo, type, item, status, note }
      adspend: [],      // 광고비 소진 { id, date, store, platform, amount, memo }
      settlements: [],  // 발주정산내역서 { id, store, date, recipient, addr, item, qty, supply, ship, total, review }
    };
  }

  let data = load();

  /* ---- 영속화 --------------------------------------------- */
  // 날짜 문자열을 YYYY-MM-DD (또는 keepTime이면 +시각) 로 통일
  function normDateStr(v, keepTime) {
    const s = String(v == null ? "" : v).trim();
    const p2 = (n) => String(n).padStart(2, "0");
    let m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/), yr, mo, dy;
    if (m) { yr = +m[1]; mo = +m[2]; dy = +m[3]; }
    else { m = s.match(/(\d{2})[-./](\d{1,2})[-./](\d{1,2})/); if (m) { yr = 2000 + +m[1]; mo = +m[2]; dy = +m[3]; } }
    if (!yr) return s;
    const date = `${yr}-${p2(mo)}-${p2(dy)}`;
    if (!keepTime) return date;
    const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return t ? `${date} ${p2(t[1])}:${t[2]}:${t[3] || "00"}` : date;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        // 세 가지 형식 자동 인식:
        // 1) 'lz1:' 접두사 → 현재 압축 형식
        // 2) '{' 시작 → 구버전 평문 JSON
        // 3) 그 외 → 접두사 없는 압축 형식 (이전 버전 호환)
        let json;
        if (raw.startsWith("lz1:") && typeof LZString !== "undefined") {
          json = LZString.decompressFromUTF16(raw.slice(4));
        } else if (raw.startsWith("{")) {
          json = raw;
        } else if (typeof LZString !== "undefined") {
          json = LZString.decompressFromUTF16(raw);
        } else {
          json = raw;
        }
        const d = Object.assign(emptyData(), JSON.parse(json));
        // 새로 추가된 기본 규칙을 기존 데이터에도 보충 (학습 규칙은 그대로 유지)
        if (!d.rules) d.rules = [];
        DEFAULT_RULES.forEach((dr) => {
          if (!d.rules.some((r) => r.kw === dr.kw && r.type === dr.type)) d.rules.push(dr);
        });
        // 예치금 날짜 표기 통일 (26/04/14, 2026.4.14 → 2026-04-14)
        (d.deposits || []).forEach((dp) => {
          if (dp.date) dp.date = normDateStr(dp.date);
          if (dp.at) dp.at = normDateStr(dp.at, true);
        });
        return d;
      }
    } catch (e) {
      console.warn("저장된 데이터를 읽지 못했습니다:", e);
    }
    return emptyData();
  }

  function save(silent) {
    data.updatedAt = new Date().toISOString();
    try {
      const json = JSON.stringify(data);
      const val = (typeof LZString !== "undefined") ? "lz1:" + LZString.compressToUTF16(json) : json;
      localStorage.setItem(KEY, val);
    } catch (e) {
      if (e && (e.name === "QuotaExceededError" || e.code === 22)) {
        alert("⚠️ 저장 공간이 꽉 찼어요.\n\n'데이터 내보내기'로 백업 후 오래된 데이터를 삭제해 주세요.\n(입력한 내용은 이번 탭을 닫기 전까지 메모리에 유지돼요)");
      }
    }
    if (!silent) document.dispatchEvent(new CustomEvent("spc:changed"));
  }

  /* ---- ID ------------------------------------------------- */
  let _seq = Date.now();
  function uid() { return "r" + (_seq++).toString(36); }

  /* ---- 조회/필터 ------------------------------------------ */
  function num(v) { if (typeof v === "string") v = v.replace(/[,₩\s]/g, ""); const n = Number(v); return isFinite(n) ? n : 0; }

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
  const _sigS = (r) => `${r.store}|${r.year}|${r.month}|${r.day}|${r.channel}|${r.supply}`;
  const _sigP = (r) => `${r.store}|${r.year}|${r.month}|${r.day}|${r.vendor}|${r.supply}|${r.desc}`;
  const _sigT = (r) => `${r.store}|${r.year}|${r.month}|${r.day}|${r.desc}|${r.amount}|${r.type}`;

  function _addDedup(arr, rows, sig) {
    const seen = new Set(arr.map(sig));
    let added = 0, skipped = 0;
    rows.forEach((r) => {
      const k = sig(r);
      if (seen.has(k)) { skipped++; }
      else { seen.add(k); arr.push(Object.assign({ id: uid() }, r)); added++; }
    });
    return { added, skipped };
  }

  function addSales(rows) { const res = _addDedup(data.sales, rows, _sigS); save(); return res; }
  function addPurchases(rows) { const res = _addDedup(data.purchases, rows, _sigP); save(); return res; }
  function addTransactions(rows) { const res = _addDedup(data.transactions, rows, _sigT); save(); return res; }
  function addOrders(rows) { rows.forEach((r) => data.orders.push(Object.assign({ id: uid() }, r))); save(); }

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

  // 같은 거래처의 정식명/약칭을 하나로 통일 (장부용 대표이름)
  // 별칭표: 특정 이름 → 대표이름
  const VENDOR_ALIAS = {
    "더자인": "최고집",
    "도매꾹": "도매꾹 이머니 충전", "도매꾹이머니충전": "도매꾹 이머니 충전",
    "늘푸룬우리": "늘푸른", "늘푸른우리": "늘푸른",
    "다모아식품": "다모아",
    "공덕농협농산물가공사업소": "공덕농협",
    "충남마른김가공수산업협동조합": "충남마른김", "충남마른김가공수산업": "충남마른김",
    "11번가": "십일번가", "에스케이플래닛": "십일번가",
    "발주": "디네트",
  };
  // 주 거래처(이 목록에 있으면 그대로 유지). 그 외 + 십일번가 제외는 모두 도매꾹으로
  const VENDOR_KEEP = ["푸드엔드베스트", "최고집", "도매꾹 이머니 충전", "해담별", "일비",
    "늘푸른", "다모아", "남부파머스", "소문난떡집", "생선상륙", "거풍푸드", "공덕농협",
    "충남마른김", "십일번가"];
  // 부분일치: 이름 안에 이 키워드가 있으면 대표이름으로 (홈택스 정식명 매칭용)
  const VENDOR_MATCH = {
    "안동간고등어": "푸드엔드베스트", "푸드엔드베스트": "푸드엔드베스트", "푸드앤드베스트": "푸드엔드베스트",
    "생선상륙": "생선상륙", "해담별": "해담별", "일비": "일비", "늘푸른": "늘푸른", "늘푸룬": "늘푸른",
    "공덕농협": "공덕농협", "최고집": "최고집", "더자인": "최고집", "남부파머스": "남부파머스",
    "거풍": "거풍푸드", "다모아": "다모아", "소문난떡": "소문난떡집", "충남마른김": "충남마른김",
    "십일번가": "십일번가", "네이버": "네이버", "카카오": "카카오", "쿠팡": "쿠팡", "지마켓": "지마켓", "당근": "당근",
  };
  function canonVendor(name) {
    let n = String(name || "").trim();
    if (!n) return "(미지정)";
    const userMap = (data && data.vendorAlias) || {};
    let s = n.replace(/주식회사|㈜|\(주\)|\(유\)|농업회사법인|영농조합법인|유한회사|협동조합/g, "").replace(/[\s\(\)（）]/g, "").trim();
    if (userMap[n]) return userMap[n];
    if (userMap[s]) return userMap[s];
    if (VENDOR_ALIAS[n]) return VENDOR_ALIAS[n];
    if (VENDOR_ALIAS[s]) return VENDOR_ALIAS[s];
    // 부분일치 (정식명 안에 대표 키워드가 들어있으면)
    for (const kw in VENDOR_MATCH) { if (s.indexOf(kw) !== -1) return VENDOR_MATCH[kw]; }
    if (VENDOR_KEEP.indexOf(s) !== -1) return s;
    // 미등록 공급처는 원래 이름 그대로 표시 (도매꾹 현금영수증은 임포트 시 직접 라벨링)
    return n;
  }

  // 특정 필드(채널/업체 등)로 묶어 건수·금액 합계 → 금액 큰 순 정렬
  function groupSum(arr, keyField, valField) {
    const m = {};
    arr.forEach((r) => {
      let k = (r[keyField] != null && r[keyField] !== "") ? r[keyField] : "(미지정)";
      if (keyField === "vendor") k = canonVendor(k);
      (m[k] = m[k] || { key: k, count: 0, sum: 0 });
      m[k].count += (num(r.orders) || 1); m[k].sum += num(r[valField]);
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
    addSales, addPurchases, addTransactions, addOrders, upsertVendor,
    remove, update, clearAll, clearKind,
    monthlySummary, sum, groupSum, classify, classifyTxn, learnRule, lookupVendor, canonVendor,
    emptyData,
    exportJSON() { return JSON.stringify(data, null, 2); },
    importJSON(json) { data = Object.assign(emptyData(), JSON.parse(json)); save(); },
    // 합치기: 기존 데이터에 백업의 매출/매입/입출금을 더하고, 마스터/규칙/취급품목 병합
    importMergeJSON(json) {
      const inc = JSON.parse(json);
      ["sales", "purchases", "transactions"].forEach((k) => {
        if (Array.isArray(inc[k])) data[k] = (data[k] || []).concat(inc[k]);
      });
      if (Array.isArray(inc.vendors)) inc.vendors.forEach((v) => upsertVendor(v));
      if (Array.isArray(inc.rules)) inc.rules.forEach((r) => {
        if (!data.rules.some((x) => x.kw === r.kw && x.type === r.type)) data.rules.push(r);
      });
      if (inc.vendorItems) data.vendorItems = Object.assign({}, inc.vendorItems, data.vendorItems);
      // 발주내역·정산서·C/S: 중복(같은 건) 제외하고 더하기
      if (Array.isArray(inc.orders)) {
        const sig = (o) => `${o.store || ""}|${o.year}|${o.month}|${o.day}|${o.vendor}|${o.desc}|${o.recipient || ""}`;
        const seen = new Set((data.orders || []).map(sig));
        inc.orders.forEach((o) => { const k = sig(o); if (!seen.has(k)) { seen.add(k); data.orders.push(Object.assign({ id: uid() }, o, { id: o.id || uid() })); } });
      }
      if (Array.isArray(inc.settlements)) {
        const sig = (o) => `${o.store || ""}|${o.vendor || ""}|${o.year}|${o.month}|${o.day}|${o.recipient}|${o.addr}|${o.item}|${o.total}|${o.no}`;
        const cnt = {}; (data.settlements || []).forEach((o) => { const k = sig(o); cnt[k] = (cnt[k] || 0) + 1; });
        const batch = {};
        inc.settlements.forEach((o) => { const k = sig(o); const i = (batch[k] = (batch[k] || 0) + 1); if ((cnt[k] || 0) < i) data.settlements.push(Object.assign({ id: o.id || uid() }, o)); });
      }
      if (Array.isArray(inc.cs)) {
        const ids = new Set((data.cs || []).map((c) => c.id));
        inc.cs.forEach((c) => { if (!c.id || !ids.has(c.id)) { const nc = Object.assign({ id: c.id || uid() }, c); data.cs.push(nc); ids.add(nc.id); } });
      }
      // 공급처 별칭: 현재 설정 우선, 백업에만 있는 항목 추가
      if (inc.vendorAlias && typeof inc.vendorAlias === "object") {
        data.vendorAlias = Object.assign({}, inc.vendorAlias, data.vendorAlias);
      }
      // 고정비: id 기준 중복 제외
      if (Array.isArray(inc.fixedCosts)) {
        const ids = new Set((data.fixedCosts || []).map((c) => c.id));
        inc.fixedCosts.forEach((c) => { if (!ids.has(c.id)) { data.fixedCosts.push(Object.assign({ id: c.id || uid() }, c)); ids.add(c.id); } });
      }
      // 수기 마감보고서: 현재에 없는 월만 추가, 있는 월은 현재 우선
      if (inc.manualReport && typeof inc.manualReport === "object") {
        if (!data.manualReport) data.manualReport = {};
        Object.entries(inc.manualReport).forEach(([ym, mData]) => {
          if (!data.manualReport[ym]) {
            data.manualReport[ym] = mData;
          } else {
            // 같은 월: 현재에 없는 사업장만 추가
            ["groven", "yb"].forEach((st) => {
              if (!data.manualReport[ym][st] && mData[st]) data.manualReport[ym][st] = mData[st];
            });
          }
        });
      }
      save();
    },
  };
})();
