/* =============================================================
 *  app.js — 화면 전환 / 마감 진행 흐름 / 표 / 인쇄용 보고서
 *  디자인: 시안3(업무 흐름) + 시안1(인쇄용 결재 보고서) 조합
 * ============================================================= */

const App = (function () {
  const S = SPC;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const won = (n) => Math.round(S.num(n)).toLocaleString("ko-KR");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const scope = { store: "", year: "", month: "", view: "home", pinned: false };
  const SCOPE_KEY = "spc_scope_v1";

  function loadSavedScope() {
    try { return JSON.parse(localStorage.getItem(SCOPE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveScope() {
    if (!scope.pinned) { localStorage.removeItem(SCOPE_KEY); return; }
    localStorage.setItem(SCOPE_KEY, JSON.stringify({
      store: scope.store, year: scope.year, month: scope.month, pinned: true,
    }));
  }

  function go(view) {
    scope.view = view;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    render();
  }

  function refreshScopeOptions() {
    const years = new Set(), months = new Set();
    [...S.data.sales, ...S.data.purchases, ...S.data.transactions].forEach((r) => {
      if (r.year) years.add(S.num(r.year)); if (r.month) months.add(S.num(r.month));
    });
    const yf = $("#f-year"), mf = $("#f-month");
    yf.innerHTML = `<option value="">전체 연도</option>` +
      [...years].sort((a, b) => b - a).map((y) => `<option value="${y}">${y}년</option>`).join("");
    mf.innerHTML = `<option value="">전체 월</option>` +
      [...months].sort((a, b) => a - b).map((m) => `<option value="${m}">${m}월</option>`).join("");
    yf.value = scope.year; mf.value = scope.month;
  }

  function scopeLabel() {
    return (scope.store ? S.STORES[scope.store].name : "통합") + " · " +
      (scope.year ? scope.year + "년 " : "전체 ") + (scope.month ? scope.month + "월" : "");
  }

  function render() {
    refreshScopeOptions();
    const main = $("#main");
    if (scope.view === "home") renderHome(main);
    else if (scope.view === "sales") renderTable(main, "sales");
    else if (scope.view === "purchases") renderTable(main, "purchases");
    else if (scope.view === "transactions") renderTable(main, "transactions");
    else if (scope.view === "orders") renderOrders(main);
    else if (scope.view === "deposits") renderDeposits(main);
    else if (scope.view === "report") renderReport(main);
    else if (scope.view === "manual") renderManualReport(main);
    else if (scope.view === "data") renderData(main);
  }

  /* ============ 마감 진행 (홈, 시안3 업무 흐름) ============ */
  function renderHome(main) {
    const { store, year, month } = scope;
    const sales = S.filterBy(S.data.sales, { store, year, month });
    const purch = S.filterBy(S.data.purchases, { store, year, month });
    const txns = S.filterBy(S.data.transactions, { store, year, month });
    const sv = S.sum(sales, "supply"), pv = S.sum(purch, "supply");
    const inSum = S.sum(txns.filter((t) => t.type === "in"), "amount");
    const outSum = S.sum(txns.filter((t) => t.type === "out"), "amount");
    const channels = new Set(sales.map((r) => r.channel || "기타"));
    const vendors = new Set(purch.map((r) => r.vendor || "(미지정)"));
    const empty = S.data.sales.length + S.data.purchases.length + S.data.transactions.length === 0;

    const step = (n, done, title, desc, statHtml, actions) => `
      <div class="flow-step ${done ? "done" : ""}">
        <div class="flow-dot">${done ? "✓" : n}</div>
        <div class="flow-body">
          <div class="flow-head"><h3>${title}</h3><span class="flow-desc">${desc}</span></div>
          <div class="flow-stat">${statHtml}</div>
          <div class="flow-actions">${actions}</div>
        </div>
      </div>`;

    main.innerHTML = `
      <div class="page-head">
        <div><h2>마감 진행</h2><div class="muted">${esc(scopeLabel())}</div></div>
        <button class="btn primary" data-go="report">📄 마감 보고서 보기</button>
      </div>

      ${empty ? `<div class="hello card">
        <h3>👋 시작해볼까요?</h3>
        <p>매달 <b>매출 → 매입 → 통장</b> 순서로 자료를 올리면 자동으로 정리되고, 마지막에 인쇄용 마감 보고서가 만들어집니다.
        모든 자료는 <b>이 브라우저에만</b> 저장됩니다.</p>
        <div class="flow-actions">
          <button class="btn" data-act="import-existing">📂 기존 마감 엑셀 불러오기</button>
        </div></div>` : ""}

      <div class="kpibar">
        <div class="kb b"><div class="l">총 매출 (공급가)</div><div class="v">₩${won(sv)}</div></div>
        <div class="kb p"><div class="l">총 매입 (공급가)</div><div class="v">₩${won(pv)}</div></div>
        <div class="kb ${sv - pv >= 0 ? "g" : "r"}"><div class="l">손익</div><div class="v">${sv - pv >= 0 ? "+" : ""}₩${won(sv - pv)}</div></div>
      </div>

      <div class="flow">
        ${step(1, sales.length > 0, "매출 마감", "채널별 정산 집계",
          `매출 합계 <b>₩${won(sv)}</b> · ${sales.length}건 · ${channels.size}개 채널`,
          `<button class="btn" data-go="sales">매출 보기</button>
           <button class="btn ghost" data-act="import-existing">엑셀 불러오기</button>`)}
        ${step(2, purch.length > 0, "매입 마감", "발주서 기준 · 매입처별",
          `매입 합계 <b>₩${won(pv)}</b> · ${purch.length}건 · 매입처 ${vendors.size}곳`,
          `<button class="btn" data-go="purchases">매입 보기</button>
           <button class="btn ghost" data-act="import-po">🧾 발주서 올리기</button>`)}
        ${step(3, txns.length > 0, "통장 정산", "기업은행 입금·출금 대사",
          `입금 <b class="pos">₩${won(inSum)}</b> · 출금 <b class="neg">₩${won(outSum)}</b> · ${txns.length}건`,
          `<button class="btn" data-go="transactions">입출금 보기</button>
           <button class="btn ghost" data-act="import-bank">🏦 통장내역 올리기</button>`)}
        ${step(4, sales.length + purch.length > 0, "손익 · 보고", "마감 보고서 작성·결재",
          `손익 <b>${sv - pv >= 0 ? "+" : ""}₩${won(sv - pv)}</b> · 마진율 ${sv ? Math.round((sv - pv) / sv * 100) : 0}%`,
          `<button class="btn primary" data-go="report">📄 보고서 보기</button>`)}
      </div>`;

    wire(main);
  }

  /* ===================== 표 (매출/매입/입출금) ===================== */
  const COLS = {
    sales: [
      ["순번", (r, i) => i + 1], ["월", (r) => `${r.year}.${r.month}`], ["채널", (r) => esc(r.channel)],
      ["구분", (r) => esc(r.taxClass)], ["내용", (r) => esc(r.desc)], ["건수", (r) => S.num(r.orders)],
      ["공급가액", (r) => won(r.supply), "num"], ["세액", (r) => won(r.vat), "num"],
      ["합계", (r) => won(r.total || r.supply), "num"], ["정산", (r) => esc(r.settled)],
    ],
    purchases: [
      ["순번", (r, i) => i + 1], ["일자", (r) => `${r.month || ""}.${r.day || ""}`], ["증빙", (r) => esc(r.evidence)],
      ["분류", (r) => esc(r.category)], ["내용", (r) => esc(r.desc)], ["업체명", (r) => esc(r.vendor)],
      ["공급가", (r) => won(r.supply), "num"], ["세액", (r) => won(r.vat), "num"],
      ["합계", (r) => won(r.total || r.supply), "num"], ["결제", (r) => esc(r.paid)],
    ],
    transactions: [
      ["순번", (r, i) => i + 1], ["일자", (r) => `${r.month || ""}.${r.day || ""}`],
      ["사업장", (r) => esc(r.store === "yb" ? "YB" : r.store === "groven" ? "그로븐" : "")],
      ["구분", (r) => `<span class="tag ${r.type}">${r.type === "in" ? "입금" : "출금"}</span>`],
      ["분류", (r) => esc(r.category)], ["내용", (r) => esc(r.desc)], ["거래처", (r) => esc(r.counterparty)],
      ["금액", (r) => won(r.amount), "num"], ["은행", (r) => esc(r.bank)], ["비고", (r) => esc(r.note)],
    ],
  };
  const SORT_FIELD = { sales: "supply", purchases: "supply", transactions: "amount" };
  const TITLES = { sales: "매출", purchases: "매입", transactions: "입출금" };

  function renderTable(main, kind) {
    let rows = S.filterBy(S.data[kind], { store: scope.store, year: scope.year, month: scope.month });
    rows = S.byAmountDesc(rows, SORT_FIELD[kind]);
    const cols = COLS[kind];
    const total = S.sum(rows, SORT_FIELD[kind]);
    const importBtn = kind === "transactions"
      ? `<button class="btn primary" data-act="import-bank">🏦 통장내역 올리기</button>`
      : kind === "purchases"
      ? `<button class="btn primary" data-act="import-po">🧾 발주서 올리기</button>`
      : `<button class="btn" data-act="import-existing">📂 엑셀 불러오기</button>`;

    const sText = (r) => [r.evidence, r.vendor, r.desc, r.category, r.channel, r.content, r.counterparty, r.note, r.paid]
      .map((x) => String(x == null ? "" : x)).join(" ").toLowerCase();

    main.innerHTML = `
      <div class="page-head">
        <div><h2>${TITLES[kind]} <span class="muted" id="tb-cnt">(${rows.length}건 · 합계 ₩${won(total)})</span></h2>
          <div class="muted">${esc(scopeLabel())} · 금액 큰 순</div></div>
        <div class="row-actions">${importBtn}</div>
      </div>
      <div class="card" style="padding:10px 14px"><input id="tb-search" placeholder="🔍 검색 (업체명·내용·증빙·분류…)" style="width:100%;border:1px solid var(--line);border-radius:9px;padding:9px 12px;font-size:13.5px"></div>
      <div class="table-wrap"><table class="grid">
        <thead><tr>${cols.map((c) => `<th class="${c[2] || ""}">${c[0]}</th>`).join("")}<th></th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr data-id="${r.id}" data-s="${esc(sText(r))}">${cols.map((c) =>
          `<td class="${c[2] || ""}">${c[1](r, i)}</td>`).join("")}
          <td class="row-actions"><button class="icon-btn edit" data-edit="${r.id}" title="수정">✎</button>
          <button class="icon-btn" data-del="${r.id}" title="삭제">✕</button></td></tr>`).join("")}
        </tbody></table>${rows.length ? "" : `<p class="empty">데이터가 없습니다. 위 버튼으로 자료를 올려보세요.</p>`}</div>`;

    const sInput = $("#tb-search", main);
    if (sInput) sInput.addEventListener("input", () => {
      const q = sInput.value.trim().toLowerCase();
      let shown = 0;
      $$("tbody tr", main).forEach((tr) => {
        const ok = !q || (tr.dataset.s || "").includes(q);
        tr.style.display = ok ? "" : "none";
        if (ok) shown++;
      });
      const cnt = $("#tb-cnt", main);
      if (cnt) cnt.textContent = `(${shown}건${q ? " 검색됨" : " · 합계 ₩" + won(total)})`;
    });

    wire(main);
    $$("[data-edit]", main).forEach((b) => b.addEventListener("click", () => Modals.editRow(kind, b.dataset.edit)));
    $$("[data-del]", main).forEach((b) => b.addEventListener("click", () => {
      if (confirm("이 행을 삭제할까요?")) S.remove(kind, b.dataset.del);
    }));
  }

  /* ===================== 인쇄용 마감 보고서 (시안1) ===================== */
  /* ===================== 발주내역 ===================== */
  function renderOrders(main) {
    let rows = S.filterBy(S.data.orders || [], { store: scope.store, year: scope.year, month: scope.month });
    rows = rows.slice().sort((a, b) => `${b.year}-${b.month}-${b.day}`.localeCompare(`${a.year}-${a.month}-${a.day}`));
    const sText = (r) => [r.vendor, r.desc, r.note].map((x) => String(x == null ? "" : x)).join(" ").toLowerCase();
    main.innerHTML = `
      <div class="page-head">
        <div><h2>📦 발주내역 <span class="muted" id="od-cnt">(${rows.length}건)</span></h2>
          <div class="muted">${esc(scopeLabel())} · 발주서 기준 (매입 증빙과 별개)</div></div>
        <div class="row-actions"><button class="btn primary" data-act="import-orders">📦 발주서 올리기</button></div>
      </div>
      <div class="card" style="padding:10px 14px"><input id="od-search" placeholder="🔍 검색 (거래처·품목)" style="width:100%;border:1px solid var(--line);border-radius:9px;padding:9px 12px;font-size:13.5px"></div>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>일자</th><th>거래처</th><th>품목/내용</th><th class="num">수량</th><th>스토어</th><th>메모</th><th></th></tr></thead>
        <tbody>${rows.map((r) => `<tr data-s="${esc(sText(r))}">
          <td>${esc((r.month || "") + "." + (r.day || ""))}</td><td>${esc(r.vendor || "")}</td>
          <td>${esc(r.desc || "")}</td><td class="num">${esc(r.qty || "")}</td>
          <td>${r.store === "yb" ? "YB" : (r.store === "groven" ? "그로븐" : "")}</td>
          <td>${esc(r.note || "")}</td>
          <td class="row-actions"><button class="icon-btn" data-delod="${r.id}" title="삭제">✕</button></td></tr>`).join("") ||
          `<tr><td colspan="7" class="empty">발주 내역이 없어요. '발주서 올리기'로 추가하세요.</td></tr>`}
        </tbody></table></div>`;
    wire(main);
    const sIn = $("#od-search", main);
    if (sIn) sIn.addEventListener("input", () => {
      const q = sIn.value.trim().toLowerCase(); let n = 0;
      $$("tbody tr", main).forEach((tr) => { const ok = !q || (tr.dataset.s || "").includes(q); tr.style.display = ok ? "" : "none"; if (ok) n++; });
      const c = $("#od-cnt", main); if (c) c.textContent = `(${n}건)`;
    });
    $$("[data-delod]", main).forEach((b) => b.addEventListener("click", () => {
      if (confirm("이 발주 건을 삭제할까요?")) { S.remove("orders", b.dataset.delod); renderOrders(main); }
    }));
  }

  /* ===================== 예치금 충전현황 ===================== */
  let depFilter = ""; // "store|vendor"
  // 현재 잔액: 잔액(bal)이 기록된 항목이 있으면 가장 최근 거래의 잔액을 사용
  // (중복 누적·부분 명세서여도 실제 잔액이 정확). 없으면 충전−사용 합계.
  // 현재 잔액 = 충전 합계 − 사용 합계 (파일·붙여넣기 등 여러 소스 합산)
  function depBalance(list) {
    const chg = list.filter((d) => d.kind === "충전").reduce((a, d) => a + S.num(d.amount), 0);
    const use = list.filter((d) => d.kind === "사용").reduce((a, d) => a + S.num(d.amount), 0);
    return chg - use;
  }

  function renderDeposits(main) {
    const SUGGEST = ["도매꾹", "늘푸른우리", "최고집"];
    const all = S.data.deposits || [];
    const deps = scope.store ? all.filter((d) => (d.store || "") === scope.store) : all;
    const vendors = [...new Set(deps.map((d) => `${d.store || ""}|${d.vendor}`))];
    if (depFilter && vendors.indexOf(depFilter) === -1) depFilter = "";
    const stNm = (s) => s === "yb" ? "YB" : (s === "groven" ? "그로븐" : "공통");
    const cardFor = (st, v) => {
      const list = deps.filter((d) => (d.store || "") === st && d.vendor === v);
      const chg = list.filter((d) => d.kind === "충전").reduce((a, d) => a + S.num(d.amount), 0);
      const use = list.filter((d) => d.kind === "사용").reduce((a, d) => a + S.num(d.amount), 0);
      const bal = depBalance(list), key = `${st}|${v}`, on = depFilter === key;
      return `<div class="kb" data-depk="${esc(key)}" style="cursor:pointer;${on ? "outline:2px solid var(--navy)" : ""}"><div class="l">${esc(v)}${on ? " ✓" : ""}</div>
        <div class="v" style="color:${bal >= 0 ? "var(--navy)" : "var(--red)"}">₩${won(bal)}</div>
        <div class="hint">충전 ₩${won(chg)} · 사용 ₩${won(use)}</div></div>`;
    };
    // 사업장별 섹션 (통합이면 그로븐/옐브 둘 다, 특정 스토어면 그 하나)
    const stores = scope.store ? [scope.store] : ["groven", "yb"];
    const sections = stores.map((st) => {
      const vs = [...new Set(all.filter((d) => (d.store || "") === st).map((d) => d.vendor).filter(Boolean))];
      if (!vs.length) return "";
      return `<h3 style="margin:6px 0 8px;color:var(--navy)">${stNm(st)}</h3>
        <div class="kpibar">${vs.map((v) => cardFor(st, v)).join("")}</div>`;
    }).join("");
    const viewDeps = depFilter ? deps.filter((d) => `${d.store || ""}|${d.vendor}` === depFilter) : deps;
    const sorted = [...viewDeps].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    main.innerHTML = `
      <div class="page-head"><div><h2>💳 예치금 충전현황 <span class="muted">${esc(scope.store ? stNm(scope.store) : "통합")}</span></h2>
        <div class="muted">사업장별로 거래처 충전·사용·잔액 (상단 스토어 탭으로 그로븐/YB만 보기)</div></div>
        <div class="row-actions"><button class="btn primary" data-act="import-deposit-file">📥 파일 올리기</button>
        <button class="btn" data-act="import-deposit-paste">📋 붙여넣기</button>
        <button class="btn ghost" id="dp-png">📸 현황 보고(PNG)</button>
        <button class="btn" id="dp-dedup">🧹 중복 정리</button>
        <button class="btn danger" id="dp-clear">🗑️ 전체삭제</button></div></div>
      ${sections || `<div class="kpibar"><div class="kb"><div class="l">아직 기록 없음</div></div></div>`}
      <div class="card"><h3>예치금 직접 입력</h3>
        <div class="form-row"><label>사업장</label>
          <div class="chips" data-g="store">
            <button type="button" class="dp-chip ${scope.store === "yb" ? "" : "on"}" data-v="groven">그로븐</button>
            <button type="button" class="dp-chip ${scope.store === "yb" ? "on" : ""}" data-v="yb">YB</button>
          </div></div>
        <div class="form-row"><label>거래처</label>
          <div class="chips" data-g="vendor">${SUGGEST.map((v) => `<button type="button" class="dp-chip" data-v="${esc(v)}">${esc(v)}</button>`).join("")}</div>
          <input id="dp-vendor" placeholder="또는 직접 입력" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 9px;margin-top:7px"></div>
        <div class="form-row"><label>구분</label>
          <div class="chips" data-g="kind">
            <button type="button" class="dp-chip kc on" data-v="충전">충전</button>
            <button type="button" class="dp-chip ku" data-v="사용">사용</button>
          </div></div>
        <div class="form-row two">
          <span><label>날짜</label><input id="dp-date" type="date" value="${new Date().toISOString().slice(0, 10)}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 9px"></span>
          <span><label>금액</label><input id="dp-amount" inputmode="numeric" placeholder="예: 500,000" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 9px;text-align:right;font-variant-numeric:tabular-nums"></span>
        </div>
        <div class="form-row"><label>메모</label><input id="dp-memo" placeholder="(선택)" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 9px"></div>
        <button class="btn primary" id="dp-add">➕ 추가</button></div>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>날짜</th><th>사업장</th><th>거래처</th><th>구분</th><th class="num">금액</th><th>메모</th><th></th></tr></thead>
        <tbody>${sorted.map((d) => `<tr><td>${esc(d.date)}</td><td>${stNm(d.store)}</td><td>${esc(d.vendor)}</td>
          <td><span class="tag ${d.kind === "충전" ? "in" : "out"}">${d.kind}</span></td>
          <td class="num">₩${won(d.amount)}</td><td>${esc(d.memo || "")}</td>
          <td class="row-actions"><button class="icon-btn edit" data-editdep="${d.id}" title="수정">✎</button><button class="icon-btn" data-deldep="${d.id}" title="삭제">✕</button></td></tr>`).join("") ||
          `<tr><td colspan="7" class="empty">기록이 없어요. 위에서 추가하거나 파일을 올리세요.</td></tr>`}
        </tbody></table></div>`;
    wire(main);
    // 거래처별 메모 기본값 (직접 입력 시 자동)
    const MEMO_DEF = { "늘푸른우리": "주문결제", "최고집": "주문결제", "도매꾹": "상품구매대금결제" };
    // 칩(버튼) 선택 — 그룹 내 하나만 선택
    const chipVal = (g) => { const el = main.querySelector(`.chips[data-g="${g}"] .dp-chip.on`); return el ? el.dataset.v : ""; };
    $$(".dp-chip", main).forEach((b) => b.addEventListener("click", () => {
      b.parentNode.querySelectorAll(".dp-chip").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      if (b.parentNode.dataset.g === "vendor") {
        const vi = $("#dp-vendor", main); if (vi) vi.value = ""; // 칩 고르면 직접입력 비움
        const mi = $("#dp-memo", main); // 메모 기본값 자동 채움(비어있거나 기본값일 때만)
        if (mi && (!mi.value.trim() || Object.values(MEMO_DEF).includes(mi.value.trim()))) mi.value = MEMO_DEF[b.dataset.v] || "";
      }
    }));
    // 금액 천단위 콤마 자동
    const amtIn = $("#dp-amount", main);
    if (amtIn) amtIn.addEventListener("input", () => {
      const n = S.num(amtIn.value);
      const cur = amtIn.selectionStart;
      amtIn.value = n ? n.toLocaleString("en-US") : "";
    });
    $("#dp-add", main).addEventListener("click", () => {
      const vendor = ($("#dp-vendor", main).value.trim()) || chipVal("vendor");
      const amount = S.num($("#dp-amount", main).value);
      const store = chipVal("store"), kind = chipVal("kind") || "충전";
      if (!vendor || !amount) { alert("거래처(칩 선택 또는 직접 입력)와 금액을 입력하세요."); return; }
      S.data.deposits.push({ id: S.uid(), store, vendor, date: $("#dp-date", main).value, kind, amount, memo: $("#dp-memo", main).value.trim() });
      S.save(); renderDeposits(main);
    });
    $$("[data-editdep]", main).forEach((b) => b.addEventListener("click", () => Modals.editRow("deposits", b.dataset.editdep)));
    $$("[data-deldep]", main).forEach((b) => b.addEventListener("click", () => {
      if (confirm("이 기록을 삭제할까요?")) { S.remove("deposits", b.dataset.deldep); renderDeposits(main); }
    }));
    $$("[data-depk]", main).forEach((c) => c.addEventListener("click", () => {
      depFilter = depFilter === c.dataset.depk ? "" : c.dataset.depk;
      renderDeposits(main);
    }));
    $("#dp-clear", main).addEventListener("click", () => {
      const stLabel = scope.store ? (scope.store === "yb" ? "YB" : "그로븐") : "전체";
      if (depFilter) {
        const [fst, fv] = depFilter.split("|");
        const target = (S.data.deposits || []).filter((d) => d.vendor === fv && (d.store || "") === fst);
        if (!target.length) { alert("삭제할 기록이 없어요."); return; }
        if (!confirm(`'${fv}' (${stNm(fst)}) 예치금 ${target.length}건을 삭제할까요?`)) return;
        S.data.deposits = (S.data.deposits || []).filter((d) => !(d.vendor === fv && (d.store || "") === fst));
        depFilter = ""; S.save(); renderDeposits(main); return;
      }
      if (deps.length === 0) { alert("삭제할 예치금 기록이 없어요."); return; }
      if (!confirm(`${stLabel} 예치금 기록 ${deps.length}건을 모두 삭제할까요? (되돌릴 수 없어요)\n\n(특정 거래처만 지우려면 카드를 먼저 클릭하세요)`)) return;
      S.data.deposits = (S.data.deposits || []).filter((d) => scope.store ? (d.store || "") !== scope.store : false);
      S.save(); renderDeposits(main);
    });
    $("#dp-png", main).addEventListener("click", () => depositUsageReport(deps));
    $("#dp-dedup", main).addEventListener("click", () => {
      const list = S.data.deposits || [];
      const sig = (d) => `${d.store || ""}|${d.vendor}|${(d.at || d.date || "")}|${d.kind}|${S.num(d.amount)}|${(d.memo || "").trim()}`;
      const seen = new Set(), keep = [];
      let removed = 0;
      list.forEach((d) => { const k = sig(d); if (seen.has(k)) { removed++; } else { seen.add(k); keep.push(d); } });
      if (!removed) { alert("완전히 동일한 중복 기록이 없어요. (날짜·금액·구분·메모가 모두 같아야 중복으로 봅니다)"); return; }
      if (!confirm(`완전히 동일한 중복 ${removed}건을 정리할까요? (각 1건만 남겨요)`)) return;
      S.data.deposits = keep; S.save(); renderDeposits(main);
      alert(`중복 ${removed}건을 정리했어요.`);
    });
  }

  // 예치금·적립금 현황 보고서 PNG (① 현재 잔액 → ② 금일 사용)
  function depositUsageReport(deps) {
    const stNm = (s) => s === "yb" ? "YB" : (s === "groven" ? "그로븐" : "공통");
    const today = new Date().toISOString().slice(0, 10);
    const todayK = today.replace(/-/g, ".");
    const data = deps || [];
    // ① 현재 잔액 현황 (사업장·거래처별 충전-사용)
    const keys = [...new Set(data.map((d) => `${d.store || ""}|${d.vendor}`))]
      .sort((a, b) => a.localeCompare(b));
    const balRows = keys.map((k) => {
      const [st, v] = k.split("|");
      const list = data.filter((d) => (d.store || "") === st && d.vendor === v);
      const chg = list.filter((d) => d.kind === "충전").reduce((a, d) => a + S.num(d.amount), 0);
      const use = list.filter((d) => d.kind === "사용").reduce((a, d) => a + S.num(d.amount), 0);
      return { st, v, chg, use, bal: depBalance(list) };
    }).filter((r) => r.chg || r.use);
    // ② 금일 사용 현황
    const useRows = data.filter((d) => d.kind === "사용" && String(d.date).slice(0, 10) === today)
      .sort((a, b) => `${a.store}|${a.vendor}`.localeCompare(`${b.store}|${b.vendor}`));
    if (!balRows.length && !useRows.length) { alert("표시할 예치금·적립금 기록이 없어요."); return; }
    const useTotal = useRows.reduce((a, d) => a + S.num(d.amount), 0);
    const balTotal = balRows.reduce((a, r) => a + r.bal, 0);

    const TD = 'border:1px solid #bcc4d0;padding:6px 8px';
    const TDc = TD + ';text-align:center';
    const TDn = TD + ';text-align:right;font-variant-numeric:tabular-nums';
    const TH = 'border:1px solid #bcc4d0;padding:7px;background:#eef1f6;font-weight:700';

    // ① 금일 사용 표
    const useBody = useRows.length ? useRows.map((d, i) => `<tr>
      <td style="${TDc}">${i + 1}</td><td style="${TDc}">${stNm(d.store)}</td>
      <td style="${TD};word-break:break-all">${esc(d.vendor)}</td>
      <td style="${TDn}">${won(d.amount)}</td><td style="${TD}">${esc(d.memo || "")}</td></tr>`).join("")
      : `<tr><td style="${TDc};color:#6b7588" colspan="5">오늘 사용한 내역이 없습니다</td></tr>`;
    const useTable = `<table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed">
      <thead><tr>
        <th style="${TH};width:42px">순번</th><th style="${TH};width:60px">사업장</th>
        <th style="${TH}">거래처</th><th style="${TH};width:120px;text-align:right">사용액</th>
        <th style="${TH};width:150px">메모</th>
      </tr></thead><tbody>${useBody}
      ${useRows.length ? `<tr style="background:#e7ebf2;font-weight:800"><td style="${TDc}" colspan="3">금일 사용 합계</td>
        <td style="${TDn}">₩${won(useTotal)}</td><td style="${TD}"></td></tr>` : ""}
      </tbody></table>`;

    // ② 잔액 — 사업장별 블록
    const order = { groven: 0, yb: 1 };
    const balStores = [...new Set(balRows.map((r) => r.st))].sort((a, b) => (order[a] ?? 9) - (order[b] ?? 9));
    const balBlocks = balStores.map((st) => {
      const rows = balRows.filter((r) => r.st === st).sort((a, b) => b.bal - a.bal);
      const sub = rows.reduce((a, r) => a + r.bal, 0);
      const body = rows.map((r) => `<tr>
        <td style="${TD};word-break:break-all">${esc(r.v)}</td>
        <td style="${TDn}">${won(r.chg)}</td><td style="${TDn}">${won(r.use)}</td>
        <td style="${TDn};font-weight:800;color:${r.bal < 0 ? "#dc2626" : "#1a3a6b"}">${won(r.bal)}</td></tr>`).join("");
      return `<div style="font-weight:800;color:#1a3a6b;font-size:13.5px;margin:12px 0 6px">▸ ${stNm(st)}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed">
          <thead><tr><th style="${TH}">거래처</th>
            <th style="${TH};width:120px;text-align:right">총 충전</th>
            <th style="${TH};width:120px;text-align:right">총 사용</th>
            <th style="${TH};width:125px;text-align:right">현재 잔액</th></tr></thead>
          <tbody>${body}<tr style="background:#f0f3f8;font-weight:800"><td style="${TD}">${stNm(st)} 소계</td>
            <td style="${TDn}"></td><td style="${TDn}"></td><td style="${TDn}">₩${won(sub)}</td></tr></tbody></table>`;
    }).join("");
    const balSection = balRows.length
      ? balBlocks + `<div style="text-align:right;font-weight:800;font-size:14px;margin:12px 2px 0;color:#1a3a6b">전체 잔액 합계 : ₩${won(balTotal)}</div>`
      : `<div style="color:#6b7588;font-size:13px;padding:8px 2px">기록 없음</div>`;

    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;top:0;width:720px;background:#fff";
    host.innerHTML = `<div id="dp-report" style="width:720px;background:#fff;padding:34px 38px;box-sizing:border-box;font-family:'Pretendard','Malgun Gothic',sans-serif;color:#1f2733">
      <div style="text-align:center;border-bottom:3px double #222;padding-bottom:12px;margin-bottom:14px">
        <div style="font-size:23px;font-weight:800;letter-spacing:5px">예치금 현황보고</div>
        <div style="font-size:12px;color:#6b7588;letter-spacing:2px;margin-top:4px">${scope.store ? stNm(scope.store) : "그로븐 · YB 통합"} &nbsp;|&nbsp; ${todayK} 기준</div>
      </div>
      <div style="font-size:14px;font-weight:800;color:#1a3a6b;border-left:4px solid #1a3a6b;padding-left:9px;margin:6px 0 9px">Ⅰ. 금일 사용 현황 <span style="font-size:12px;font-weight:600;color:#6b7588">(${todayK})</span></div>
      ${useTable}
      <div style="font-size:14px;font-weight:800;color:#1a3a6b;border-left:4px solid #1a3a6b;padding-left:9px;margin:24px 0 4px">Ⅱ. 현재 예치금·적립금 잔액</div>
      ${balSection}
      <div style="margin-top:18px;font-size:11px;color:#6b7588;text-align:right">출력일 : ${todayK}</div>
    </div>`;
    document.body.appendChild(host);
    const node = host.querySelector("#dp-report");
    if (typeof html2canvas !== "function") { alert("이미지 변환 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인해주세요."); host.remove(); return; }
    html2canvas(node, { scale: 2, backgroundColor: "#ffffff" }).then((canvas) => {
      host.remove();
      previewCanvas(canvas, `예치금현황_${today}.png`);
    }).catch((e) => { alert("이미지 저장 실패: " + e); host.remove(); });
  }

  // Ⅶ. 예치금 현황 (사업장·거래처별 충전/사용/잔액)
  function depositSection(store) {
    const all = (S.data.deposits || []).filter((d) => !store || (d.store || "") === store);
    if (!all.length) return "";
    const stNm = (s) => s === "yb" ? "YB" : (s === "groven" ? "그로븐" : "공통");
    const keys = [...new Set(all.map((d) => (d.store || "") + "|" + d.vendor))];
    const rows = keys.map((k) => {
      const [st, v] = k.split("|");
      const list = all.filter((d) => (d.store || "") === st && d.vendor === v);
      const chg = list.filter((d) => d.kind === "충전").reduce((a, d) => a + S.num(d.amount), 0);
      const use = list.filter((d) => d.kind === "사용").reduce((a, d) => a + S.num(d.amount), 0);
      return { st, v, chg, use, bal: depBalance(list) };
    }).sort((a, b) => b.bal - a.bal);
    const body = rows.map((r) => `<tr><td class="c">${stNm(r.st)}</td><td class="name">${esc(r.v)}</td>
      <td class="n">${won(r.chg)}</td><td class="n">${won(r.use)}</td><td class="n" style="font-weight:700">${won(r.bal)}</td></tr>`).join("");
    return `<h4 class="doc-sec">Ⅶ. 예치금 충전현황</h4>
      <table class="doc-table">
        <thead><tr><th class="c" style="width:54px">사업장</th><th>거래처</th><th class="n" style="width:120px">충전</th><th class="n" style="width:120px">사용</th><th class="n" style="width:120px">잔액</th></tr></thead>
        <tbody>${body}</tbody></table>`;
  }

  // Ⅵ. 홈택스 증빙 대조 (거래처별, 저장된 것 표시)
  function evidenceSection(store, year, month) {
    const saved = (S.data.evidence && S.data.evidence[year + "-" + month]) || [];
    const rows = saved.filter((e) => !store || e.store === store);
    if (!rows.length) return "";
    const storeNm = (s) => s === "yb" ? "YB" : (s === "groven" ? "그로븐" : "통합");
    const withBook = rows.map((e) => {
      const book = S.filterBy(S.data.purchases, { store: e.store, year, month })
        .filter((r) => S.canonVendor(r.vendor) === e.vendor)
        .reduce((a, r) => a + S.num(r.supply || r.total), 0);
      return Object.assign({}, e, { book, diff: e.ht - book });
    }).sort((a, b) => b.ht - a.ht);
    const body = withBook.map((e) => `<tr><td class="name">${esc(e.vendor)}</td><td>${esc(e.type)}</td><td class="c">${storeNm(e.store)}</td>
      <td class="n">${won(e.ht)}</td><td class="n">${won(e.book)}</td>
      <td class="n ${e.diff === 0 ? "pos" : "neg"}">${e.diff > 0 ? "+" : ""}${won(e.diff)}</td>
      <td class="c">${e.diff === 0 ? "✅" : "🔴"}</td></tr>`).join("");
    const htSum = withBook.reduce((a, e) => a + e.ht, 0);
    const bkSum = withBook.reduce((a, e) => a + e.book, 0);
    return `<h4 class="doc-sec">Ⅵ. 매입 증빙 대조 (홈택스 발행 ↔ 장부)</h4>
      <table class="doc-table">
        <thead><tr><th>거래처</th><th style="width:80px">증빙</th><th class="c" style="width:50px">스토어</th><th class="n" style="width:96px">홈택스</th><th class="n" style="width:96px">장부</th><th class="n" style="width:88px">차액</th><th class="c" style="width:40px">판정</th></tr></thead>
        <tbody>${body}<tr class="sum"><td colspan="3">합계</td><td class="n">${won(htSum)}</td><td class="n">${won(bkSum)}</td><td class="n ${htSum - bkSum === 0 ? "pos" : "neg"}">${won(htSum - bkSum)}</td><td></td></tr></tbody>
      </table>`;
  }

  /* ===================== 수기 마감보고서 ===================== */
  function blankStoreReport() {
    return { sales: 0, purchase: 0, channels: [], vendors: [], bank: { inCnt: 0, inSum: 0, outCnt: 0, outSum: 0 }, memo: "" };
  }
  // 실제 데이터(매출·매입·통장)에서 한 사업장 보고서를 자동 생성
  function autoFillStoreReport(st, yr, mo) {
    const r = blankStoreReport();
    const sl = S.filterBy(S.data.sales, { store: st, year: yr, month: mo });
    const pl = S.filterBy(S.data.purchases, { store: st, year: yr, month: mo });
    r.sales = S.sum(sl, "supply");
    r.purchase = S.sum(pl, "supply");
    r.channels = S.groupSum(sl, "channel", "supply").map((g) => ({ name: g.key, count: g.count, supply: g.sum }));
    r.vendors = S.groupSum(pl, "vendor", "supply").map((g) => ({ name: g.key, note: (S.data.vendorItems && S.data.vendorItems[g.key]) || "", count: g.count, supply: g.sum }));
    // 고정비/정기결제 자동 반영 (매월 동일) — 같은 공급처가 매입에도 있으면 합산
    (S.data.fixedCosts || []).filter((fc) => (fc.store || "") === st).forEach((fc) => {
      const ex = r.vendors.find((v) => v.name === fc.vendor && (v.note || "") === (fc.note || ""));
      if (ex) { ex.supply += S.num(fc.amount); ex.count += S.num(fc.count); }
      else r.vendors.push({ name: fc.vendor, note: fc.note || "", count: S.num(fc.count), supply: S.num(fc.amount) });
    });
    r.purchase = r.vendors.reduce((a, v) => a + S.num(v.supply), 0);
    const tx = S.filterBy(S.data.transactions, { store: st, year: yr, month: mo });
    const ins = tx.filter((t) => t.type === "in"), outs = tx.filter((t) => t.type === "out");
    r.bank = { inCnt: ins.length, inSum: S.sum(ins, "amount"), outCnt: outs.length, outSum: S.sum(outs, "amount") };
    return r;
  }
  // 통합용: 두 사업장 detail 합치기 (이름 기준)
  function mergeDetail(a, b, hasNote) {
    const m = {};
    [].concat(a || [], b || []).forEach((r) => {
      const k = r.name || "";
      if (!m[k]) m[k] = { name: k, note: "", count: 0, supply: 0 };
      m[k].count += S.num(r.count);
      m[k].supply += S.num(r.supply);
      if (hasNote && r.note && !m[k].note) m[k].note = r.note;
    });
    return Object.values(m).sort((x, y) => S.num(y.supply) - S.num(x.supply));
  }

  // 과거 월별 매출 이력 (업로드 마감엑셀 '매출' 탭 기준, 공급가)
  const SALES_HISTORY = {
    groven: { "2025-12": 400280, "2026-1": 3023550, "2026-2": 4186620, "2026-3": 4654764, "2026-4": 16660140 },
    yb: { "2026-3": 439681, "2026-4": 10800136 },
  };
  // 실제 데이터 월별집계에 과거 매출 이력을 얹어 추이용 데이터 생성
  function trendSales(store) {
    const combined = {};
    ["groven", "yb"].forEach((s) => Object.entries(SALES_HISTORY[s]).forEach(([ym, a]) => { combined[ym] = (combined[ym] || 0) + a; }));
    const hist = store ? SALES_HISTORY[store] : combined;
    const base = {};
    S.monthlySummary(store).forEach((r) => { base[r.y + "-" + r.m] = { y: r.y, m: r.m, sales: r.sales, purchase: r.purchase }; });
    Object.entries(hist || {}).forEach(([ym, amt]) => {
      const [y, m] = ym.split("-").map(Number);
      if (!base[ym]) base[ym] = { y, m, sales: 0, purchase: 0 };
      if (amt > base[ym].sales) base[ym].sales = amt; // 실제값이 더 크면 유지
    });
    const rows = Object.values(base).sort((a, b) => a.y - b.y || a.m - b.m);
    let cum = 0; rows.forEach((r) => { r.profit = r.sales - r.purchase; cum += r.profit; r.cumulative = cum; });
    return rows;
  }

  // 월별 매출만 막대로 그리는 추이 차트 (파스텔)
  function salesTrendChart(canvasId, monthly) {
    const cv = document.getElementById(canvasId);
    if (!cv || !window.Chart || !monthly.length) return;
    const fmt = (v) => Math.abs(v) >= 10000 ? Math.round(v / 10000) + "만" : v;
    try {
      new Chart(cv, {
        type: "bar",
        data: { labels: monthly.map((r) => `${String(r.y).slice(2)}.${r.m}`),
          datasets: [{ label: "매출", data: monthly.map((r) => r.sales), backgroundColor: "#8fb3e0", borderRadius: 4, maxBarThickness: 30 }] },
        options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `₩${won(c.parsed.y)}` } } },
          scales: { y: { ticks: { font: { size: 10 }, callback: fmt } }, x: { ticks: { font: { size: 10 } } } },
          responsive: true, maintainAspectRatio: false },
      });
    } catch (e) { console.warn("매출추이 차트 실패", e); }
  }

  // 파스텔 도넛 차트 (범례 하단). groups: [{key, sum}]
  function pastelDoughnut(canvasId, groups) {
    const cv = document.getElementById(canvasId);
    if (!cv || !window.Chart || !groups || !groups.length) return;
    const PAL = ["#8fb3e0", "#9fd6ae", "#f5d08a", "#f2a9a9", "#c2b0e8", "#93cdd9", "#f3aecf", "#aeb8c9"];
    const top = groups.slice(0, 7);
    const etc = groups.slice(7).reduce((a, g) => a + g.sum, 0);
    const arr = etc > 0 ? top.concat([{ key: "기타", sum: etc }]) : top;
    // 큰 조각 안에 % 표시 (글자 들어갈 만큼 큰 것만)
    const pctPlugin = {
      id: "pctInside",
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const ds = chart.data.datasets[0].data;
        const total = ds.reduce((a, b) => a + (+b || 0), 0);
        if (!total) return;
        ctx.save();
        ctx.font = "bold 11px 'Pretendard','Malgun Gothic',sans-serif";
        ctx.fillStyle = "#33414f";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        chart.getDatasetMeta(0).data.forEach((arc, i) => {
          const pct = (+ds[i] || 0) / total * 100;
          if (pct < 8) return; // 글자 안 들어갈 작은 조각은 생략
          const ang = (arc.startAngle + arc.endAngle) / 2;
          const r = (arc.innerRadius + arc.outerRadius) / 2;
          ctx.fillText(pct.toFixed(1) + "%", arc.x + Math.cos(ang) * r, arc.y + Math.sin(ang) * r);
        });
        ctx.restore();
      },
    };
    try {
      new Chart(cv, {
        type: "doughnut",
        data: { labels: arr.map((d) => d.key), datasets: [{ data: arr.map((d) => d.sum), backgroundColor: arr.map((_, i) => PAL[i % PAL.length]), borderWidth: 1 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 9 }, padding: 5 } },
            tooltip: { callbacks: { label: (c) => `${c.label}: ${won(c.parsed)}` } } } },
        plugins: [pctPlugin],
      });
    } catch (e) { console.warn("도넛 차트 실패", e); }
  }

  // 캔버스 미리보기 모달 — 저장 전에 확인
  function previewCanvas(canvas, filename) {
    const url = canvas.toDataURL("image/png");
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0;z-index:100;background:rgba(20,28,50,.55);display:flex;flex-direction:column;align-items:center;padding:18px;overflow:auto";
    host.innerHTML = `
      <div style="background:#fff;border-radius:12px;max-width:840px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);display:flex;flex-direction:column;max-height:94vh">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 18px;border-bottom:1px solid #e3e8f0">
          <b style="font-size:15px">🖼️ 미리보기 <span style="font-weight:500;color:#6b7588;font-size:12.5px">— 확인 후 저장하세요</span></b>
          <div style="display:flex;gap:8px">
            <button class="btn" id="pv-close">닫기</button>
            <button class="btn primary" id="pv-save">📥 PNG 저장</button>
          </div>
        </div>
        <div style="overflow:auto;padding:16px;background:#eef1f6;text-align:center">
          <img src="${url}" style="max-width:100%;box-shadow:0 2px 12px rgba(0,0,0,.15);border-radius:4px">
        </div>
      </div>`;
    document.body.appendChild(host);
    const close = () => host.remove();
    host.addEventListener("click", (e) => { if (e.target === host) close(); });
    host.querySelector("#pv-close").onclick = close;
    host.querySelector("#pv-save").onclick = () => { const a = document.createElement("a"); a.download = filename; a.href = url; a.click(); close(); };
  }

  // 보고서(.sheet)를 한 장의 PNG로 — 미리보기 후 저장
  function exportSheetPng(main, label) {
    const node = main.querySelector(".sheet");
    if (!node) return;
    if (typeof html2canvas !== "function") { alert("이미지 변환 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인해주세요."); return; }
    const today = new Date().toISOString().slice(0, 10);
    html2canvas(node, {
      scale: 2, backgroundColor: "#ffffff", useCORS: true,
      onclone: (doc) => {
        doc.querySelectorAll(".no-print").forEach((el) => el.remove());
        // 표는 내용에 맞춰 자동 너비 + 셀 글자는 한 줄로(줄바꿈 방지)
        doc.querySelectorAll(".sheet table.doc-table").forEach((t) => { t.style.tableLayout = "auto"; });
        doc.querySelectorAll(".sheet .doc-table td, .sheet .doc-table th").forEach((c) => { c.style.whiteSpace = "nowrap"; c.style.wordBreak = "normal"; });
        doc.querySelectorAll(".mr-in").forEach((el) => {
          const isNum = el.classList.contains("n");
          const isArea = el.tagName === "TEXTAREA";
          let v = (el.value != null ? el.value : el.textContent) || "";
          if (isNum) v = won(S.num(v));
          const span = doc.createElement("span");
          span.textContent = v;
          span.style.cssText = "display:block;font-size:12px;padding:2px 6px 2px 0;" +
            (isNum ? "text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;"
                   : isArea ? "white-space:pre-wrap;" : "white-space:nowrap;");
          el.parentNode.replaceChild(span, el);
        });
      },
    }).then((canvas) => {
      previewCanvas(canvas, `마감보고서_${label}_${today}.png`);
    }).catch((e) => alert("이미지 저장 실패: " + e));
  }

  function renderManualReport(main) {
    if (!scope.year || !scope.month) {
      main.innerHTML = `<div class="page-head"><div><h2>📝 마감보고서(수기)</h2></div></div>
        <div class="card"><p>상단에서 <b>연도·월</b>을 먼저 골라주세요. (예: 2026년 / 5월)</p></div>`;
      return;
    }
    const ym = scope.year + "-" + scope.month, yr = scope.year, mo = scope.month;
    if (!S.data.manualReport) S.data.manualReport = {};
    let M = S.data.manualReport[ym];
    // 구버전(통합 단일) → 사업장별 구조로 이전
    if (M && M.income && !M.groven) {
      const conv = {};
      ["groven", "yb"].forEach((st, idx) => {
        const r = autoFillStoreReport(st, yr, mo);
        if (M.income[idx]) { r.sales = S.num(M.income[idx].sales); r.purchase = S.num(M.income[idx].purchase); }
        conv[st] = r;
      });
      if (M.memo) conv.groven.memo = M.memo;
      M = S.data.manualReport[ym] = conv;
    }
    if (!M) M = S.data.manualReport[ym] = {};
    // 첫 진입 시 실제 데이터로 자동 채움 (이후엔 수정값 유지)
    let filled = false;
    ["groven", "yb"].forEach((st) => { if (!M[st]) { M[st] = autoFillStoreReport(st, yr, mo); filled = true; } });
    if (filled) S.save();

    if (scope.store === "groven" || scope.store === "yb") renderManualStore(main, M, scope.store, ym, yr, mo);
    else renderManualCombined(main, M, ym, yr, mo);
  }

  // 사업장별 수기 보고서 (편집 가능)
  function renderManualStore(main, M, store, ym, yr, mo) {
    const R = M[store];
    if (!R.platform) R.platform = [];
    // 2026년 5월 옐로우브릿지 플랫폼 수수료·광고비 세부 1회 자동 채움 (사용자 요청)
    if (store === "yb" && String(yr) === "2026" && String(mo) === "5" && !R._pfSeeded && R.platform.length === 0) {
      R.platform = [
        { supplier: "십일번가", item: "상품전시", type: "광고비", amount: 229200 },
        { supplier: "십일번가", item: "서비스이용료", type: "수수료", amount: 67631 },
        { supplier: "네이버파이낸셜", item: "판매수수료", type: "수수료", amount: 1995 },
        { supplier: "카카오", item: "카카오스토어", type: "수수료", amount: 1997 },
        { supplier: "쿠팡페이", item: "3P_영중소", type: "수수료", amount: -28909 },
        { supplier: "쿠팡", item: "ProductAD", type: "광고비", amount: 937049 },
        { supplier: "쿠팡", item: "판매수수료", type: "수수료", amount: 807581 },
        { supplier: "지마켓", item: "옥션 광고", type: "광고비", amount: 485195 },
        { supplier: "지마켓", item: "옥션 서비스", type: "수수료", amount: 68534 },
      ];
      R._pfSeeded = true;
      S.save(true);
    }
    // 이미 채워진 5월 YB 데이터: 쿠팡페이 광고비 → 수수료 1회 보정
    if (store === "yb" && String(yr) === "2026" && String(mo) === "5" && !R._pfFixCpay) {
      R.platform.forEach((r) => { if (r.supplier === "쿠팡페이" && r.type === "광고비") r.type = "수수료"; });
      R._pfFixCpay = true;
      S.save(true);
    }
    // 2026년 5월 그로븐 플랫폼 수수료·광고비 세부 1회 자동 채움 (사용자 요청, 공장임대료 제외)
    if (store === "groven" && String(yr) === "2026" && String(mo) === "5" && !R._pfSeeded && R.platform.length === 0) {
      R.platform = [
        { supplier: "십일번가", item: "상품전시", type: "광고비", amount: 50634 },
        { supplier: "십일번가", item: "서비스이용료", type: "수수료", amount: 12817 },
        { supplier: "네이버파이낸셜", item: "판매수수료", type: "수수료", amount: 5969 },
        { supplier: "카카오", item: "카카오스토어 구매확정", type: "수수료", amount: 13753 },
        { supplier: "쿠팡페이", item: "3P_영중소", type: "수수료", amount: -29842 },
        { supplier: "쿠팡", item: "ProductAD", type: "광고비", amount: 503277 },
        { supplier: "지마켓", item: "판매수수료", type: "수수료", amount: 730429 },
        { supplier: "지마켓", item: "옥션 광고 서비스 이용료", type: "광고비", amount: 13170 },
        { supplier: "지마켓", item: "옥션 서비스 이용료", type: "수수료", amount: 34015 },
        { supplier: "지마켓", item: "G마켓 수수료", type: "수수료", amount: 47741 },
        { supplier: "당근마켓", item: "커머스 판매수수료", type: "수수료", amount: 965 },
        { supplier: "당근마켓", item: "커머스 잔액정산", type: "수수료", amount: -528 },
      ];
      R._pfSeeded = true;
      S.save(true);
    }
    const fullNm = store === "yb" ? "옐로우브릿지" : "그로븐";
    const tax = store === "yb" ? "과세" : "면세";
    const numIn = (sec, i, f, v) => `<input class="mr-in n" data-sec="${sec}" data-i="${i}" data-f="${f}" value="${S.num(v)}" inputmode="numeric">`;
    const txtIn = (sec, i, f, v, ph) => `<input class="mr-in" data-sec="${sec}" data-i="${i}" data-f="${f}" value="${esc(v || "")}" placeholder="${ph || ""}">`;

    // 공급가 많은 순으로 정렬 (빈 행은 자연히 아래로)
    R.channels.sort((a, b) => S.num(b.supply) - S.num(a.supply));
    R.vendors.sort((a, b) => S.num(b.supply) - S.num(a.supply));

    const chT = R.channels.reduce((a, r) => a + S.num(r.supply), 0);
    const chBody = R.channels.map((r, i) => `<tr><td class="c">${i + 1}</td>
      <td>${txtIn("channels", i, "name", r.name, "채널명")}</td>
      <td class="n">${numIn("channels", i, "count", r.count)}</td>
      <td class="n">${numIn("channels", i, "supply", r.supply)}</td>
      <td class="n mr-chpct" data-pi="${i}">${chT ? (S.num(r.supply) / chT * 100).toFixed(1) : "0.0"}%</td>
      <td class="c no-print"><button class="icon-btn" data-rm="channels" data-i="${i}">✕</button></td></tr>`).join("");

    const vnT = R.vendors.reduce((a, r) => a + S.num(r.supply), 0);
    // 공급처 매입을 '상품매입'(내용에 상품매입 포함)과 '그 외'로 나눠 그룹·소계·그룹내 비중
    const vnIdx = R.vendors.map((r, i) => ({ r, i }));
    const isProd = (x) => /상품매입/.test(x.r.note || "");
    const byVS = (a, b) => S.num(b.r.supply) - S.num(a.r.supply);
    const prodRows = vnIdx.filter(isProd).sort(byVS);
    const etcRows = vnIdx.filter((x) => !isProd(x)).sort(byVS);
    const prodT = prodRows.reduce((a, x) => a + S.num(x.r.supply), 0);
    const etcT = etcRows.reduce((a, x) => a + S.num(x.r.supply), 0);
    const vnRow = (x, n, grpT, grp) => `<tr><td class="c">${n}</td>
      <td>${txtIn("vendors", x.i, "name", x.r.name, "공급처")}</td>
      <td>${txtIn("vendors", x.i, "note", x.r.note, "내용")}</td>
      <td class="n">${numIn("vendors", x.i, "count", x.r.count)}</td>
      <td class="n">${numIn("vendors", x.i, "supply", x.r.supply)}</td>
      <td class="n mr-vnpct" data-pi="${x.i}" data-grp="${grp}">${grpT ? (S.num(x.r.supply) / grpT * 100).toFixed(1) : "0.0"}%</td>
      <td class="c no-print"><button class="icon-btn" data-rm="vendors" data-i="${x.i}">✕</button></td></tr>`;
    const vnGroup = (rows, label, grpT, grp) => `<tr style="background:#eef4ff"><td colspan="7" style="font-weight:700;color:var(--navy);padding:5px 9px">${label}</td></tr>`
      + (rows.length ? rows.map((x, n) => vnRow(x, n + 1, grpT, grp)).join("") : `<tr><td colspan="7" class="empty">없음</td></tr>`);
    const vnBody = vnGroup(prodRows, "▸ 상품매입", prodT, "prod")
      + `<tr class="sum"><td colspan="4">상품매입 소계</td><td class="n" id="mr-prodT">${won(prodT)}</td><td class="n">100%</td><td class="no-print"></td></tr>`
      + vnGroup(etcRows, "▸ 수수료·광고비·기타", etcT, "etc")
      + `<tr class="sum"><td colspan="4">기타 소계</td><td class="n" id="mr-etcT">${won(etcT)}</td><td class="n">100%</td><td class="no-print"></td></tr>`;

    // 손익 요약 매출·매입은 채널별·매입처별 합계에서 자동 집계
    R.sales = chT; R.purchase = vnT;
    const profit = chT - vnT;
    const rate = chT ? Math.round((chT - vnT) / chT * 100) : 0;

    // 구분 컬럼 없이, 수수료/광고비 그룹으로 나눠서 표시 (6열: 순번·플랫폼·내용·금액·비중·삭제)
    const pfIdx = R.platform.map((r, i) => ({ r, i }));
    const byAmt = (a, b) => S.num(b.r.amount) - S.num(a.r.amount);
    const feeRows = pfIdx.filter((x) => x.r.type !== "광고비").sort(byAmt);
    const adRows = pfIdx.filter((x) => x.r.type === "광고비").sort(byAmt);
    const pfFee = feeRows.reduce((a, x) => a + S.num(x.r.amount), 0);
    const pfAd = adRows.reduce((a, x) => a + S.num(x.r.amount), 0);
    const pfRowHtml = (r, i, n, grpT, grp) => `<tr><td class="c">${n}</td>
      <td>${txtIn("platform", i, "supplier", r.supplier, "플랫폼")}</td>
      <td>${txtIn("platform", i, "item", r.item, "내용")}</td>
      <td class="n">${numIn("platform", i, "amount", r.amount)}</td>
      <td class="n mr-pfpct" data-pi="${i}" data-grp="${grp}">${grpT ? (S.num(r.amount) / grpT * 100).toFixed(1) : "0.0"}%</td>
      <td class="c no-print"><button class="icon-btn" data-rm="platform" data-i="${i}">✕</button></td></tr>`;
    const pfGroup = (rows, label, type, grpT, grp) => `<tr style="background:#eef4ff"><td colspan="6" style="font-weight:700;color:var(--navy);padding:5px 9px">${label}<button class="btn no-print" data-addpf="${type}" style="padding:1px 8px;font-size:11px;margin-left:8px;font-weight:600">➕ 행추가</button></td></tr>`
      + (rows.length ? rows.map((x, n) => pfRowHtml(x.r, x.i, n + 1, grpT, grp)).join("") : `<tr><td colspan="6" class="empty">‘행추가’로 입력하세요</td></tr>`);
    const pfBody = pfGroup(feeRows, "▸ 플랫폼 수수료", "수수료", pfFee, "fee")
      + `<tr class="sum"><td colspan="3">플랫폼 수수료 소계</td><td class="n" id="mr-pfFee">${won(pfFee)}</td><td class="n">100%</td><td class="no-print"></td></tr>`
      + pfGroup(adRows, "▸ 플랫폼 광고비", "광고비", pfAd, "ad")
      + `<tr class="sum"><td colspan="3">플랫폼 광고비 소계</td><td class="n" id="mr-pfAd">${won(pfAd)}</td><td class="n">100%</td><td class="no-print"></td></tr>`;
    // 플랫폼별 비용 비중 도넛용 (양수만)
    const pfChMap = {};
    R.platform.forEach((r) => { pfChMap[r.supplier || "(미입력)"] = (pfChMap[r.supplier || "(미입력)"] || 0) + S.num(r.amount); });
    const pfChart = Object.entries(pfChMap).map(([k, v]) => ({ key: k, sum: v })).filter((g) => g.sum > 0).sort((a, b) => b.sum - a.sum);

    main.innerHTML = `
      <div class="page-head no-print">
        <div><h2>📝 마감보고서(수기) · ${fullNm} <span class="muted">${yr}년 ${mo}월</span></h2>
          <div class="muted">처음 열면 실제 데이터로 자동 채워져요. 자유롭게 수정하세요. (자동 저장 · 통합 탭에서 합산본 확인)</div></div>
        <div class="row-actions">
          <button class="btn" id="mr-auto">📥 자동값 다시 불러오기</button>
          <button class="btn" id="mr-png">📸 PNG 저장</button>
          <button class="btn primary" id="mr-print">🖨️ 인쇄</button></div>
      </div>
      <div class="sheet">
        <div class="doc-head"><h1>${mo}월 마감 보고서</h1><div class="doc-sub">${fullNm} ${yr}년 ${mo}월 MONTHLY CLOSING REPORT</div></div>
        <div class="doc-meta"><div class="meta"><div><b>대상월</b> ${yr}년 ${mo}월</div>
          <div><b>사업장</b> ${fullNm} (${tax})</div><div><b>작성일</b> ${new Date().toLocaleDateString("ko-KR")}</div></div>
          <div class="approval"><div class="c head2">결재</div><div class="c"><div class="h">작성</div><div class="s"></div></div><div class="c"><div class="h">검토</div><div class="s"></div></div><div class="c"><div class="h">대표</div><div class="s"></div></div></div>
        </div>
        <h4 class="doc-sec">Ⅰ. 손익 요약${store === "yb" ? " (공급가 기준)" : ""} <span class="muted no-print" style="font-weight:400;font-size:11px">— 매출·매입은 아래 표 합계에서 자동</span></h4>
        <table class="doc-table"><thead><tr><th>사업장</th><th>구분</th><th class="n">매출</th><th class="n">매입</th><th class="n">손익</th><th class="n">마진율</th></tr></thead>
          <tbody><tr><td>${fullNm}</td><td>${tax}</td>
            <td class="n" id="mr-saleSum">${won(chT)}</td>
            <td class="n" id="mr-buySum">${won(vnT)}</td>
            <td class="n ${profit >= 0 ? "pos" : "neg"}" id="mr-profit">${won(profit)}</td><td class="n" id="mr-rate">${rate}%</td></tr></tbody></table>

        <h4 class="doc-sec">Ⅱ. 채널별 매출 <button class="btn no-print" data-add="channels" style="padding:3px 9px;font-size:12px;margin-left:8px">➕ 행추가</button></h4>
        <table class="doc-table"><thead><tr><th class="c" style="width:40px">순번</th><th>채널</th><th class="n" style="width:80px">건수</th><th class="n" style="width:130px">공급가</th><th class="n" style="width:64px">비중</th><th class="no-print" style="width:30px"></th></tr></thead>
          <tbody>${chBody || `<tr><td colspan="6" class="empty">행추가로 채널을 입력하세요</td></tr>`}<tr class="sum"><td colspan="3">합계</td><td class="n" id="mr-chT">${won(chT)}</td><td class="n">100%</td><td class="no-print"></td></tr></tbody></table>

        <h4 class="doc-sec">Ⅱ-1. 채널별 매출 추이·구성</h4>
        <div class="mr-chart-row" style="display:flex;gap:14px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div style="position:relative;border:1px solid #d4dae4;border-radius:6px;padding:8px;height:240px"><canvas id="mr-trend"></canvas></div>
            <div class="muted" style="font-size:10px;text-align:center;margin-top:4px">월별 매출 추이</div>
          </div>
          <div style="width:240px;flex-shrink:0">
            <div style="position:relative;border:1px solid #d4dae4;border-radius:6px;padding:8px;height:240px"><canvas id="mr-ch-ch"></canvas></div>
            <div class="muted" style="font-size:10px;text-align:center;margin-top:4px">채널별 매출 비중</div>
          </div>
        </div>

        <h4 class="doc-sec">Ⅲ. 공급처별 매입 <button class="btn no-print" data-add="vendors" style="padding:3px 9px;font-size:12px;margin-left:8px">➕ 행추가</button></h4>
        <table class="doc-table"><thead><tr><th class="c" style="width:40px">순번</th><th style="width:132px">공급처</th><th>내용</th><th class="n" style="width:64px">건수</th><th class="n" style="width:110px">공급가</th><th class="n" style="width:56px">비중</th><th class="no-print" style="width:28px"></th></tr></thead>
          <tbody>${vnBody}<tr class="sum"><td colspan="4">합계</td><td class="n" id="mr-vnT">${won(vnT)}</td><td class="n"></td><td class="no-print"></td></tr></tbody></table>

        <h4 class="doc-sec">Ⅲ-1. 플랫폼 수수료·광고비 세부</h4>
        <div class="mr-chart-row" style="display:flex;gap:14px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <table class="doc-table"><thead><tr><th class="c" style="width:40px">순번</th><th>플랫폼</th><th>내용</th><th class="n" style="width:110px">금액</th><th class="n" style="width:60px">비중</th><th class="no-print" style="width:30px"></th></tr></thead>
              <tbody>${pfBody}</tbody></table>
          </div>
          <div style="width:240px;flex-shrink:0">
            <div style="position:relative;border:1px solid #d4dae4;border-radius:6px;padding:8px;height:240px"><canvas id="mr-pf-ch"></canvas></div>
            <div class="muted" style="font-size:10px;text-align:center;margin-top:4px">플랫폼별 수수료·광고비 비용</div>
          </div>
        </div>

        <div id="mr-memo-wrap"${String(R.memo || "").trim() ? "" : ` class="no-print"`}>
        <h4 class="doc-sec">Ⅳ. 비고</h4>
        <textarea class="mr-in" data-sec="memo" data-i="0" data-f="memo" rows="3" style="width:100%" placeholder="특이사항(없으면 인쇄·이미지에서 자동 생략)">${esc(R.memo || "")}</textarea>
        </div>
      </div>`;

    const reSave = (rerender) => { S.save(); if (rerender) renderManualReport(main); };
    // 합계·손익만 제자리에서 갱신 (전체 다시 그리지 않음 → 포커스/스크롤 유지)
    const recalc = () => {
      const chTotal = R.channels.reduce((a, r) => a + S.num(r.supply), 0);
      const vnTotal = R.vendors.reduce((a, r) => a + S.num(r.supply), 0);
      R.sales = chTotal; R.purchase = vnTotal; // 손익요약 매출·매입 자동 반영
      const pf = chTotal - vnTotal;
      const rt = chTotal ? Math.round((chTotal - vnTotal) / chTotal * 100) : 0;
      const se = $("#mr-saleSum", main); if (se) se.textContent = won(chTotal);
      const bse = $("#mr-buySum", main); if (bse) bse.textContent = won(vnTotal);
      const pe = $("#mr-profit", main); if (pe) { pe.textContent = won(pf); pe.className = "n " + (pf >= 0 ? "pos" : "neg"); }
      const re = $("#mr-rate", main); if (re) re.textContent = rt + "%";
      const ce = $("#mr-chT", main); if (ce) ce.textContent = won(chTotal);
      const ve = $("#mr-vnT", main); if (ve) ve.textContent = won(vnTotal);
      const prodTot = R.vendors.filter((r) => /상품매입/.test(r.note || "")).reduce((a, r) => a + S.num(r.supply), 0);
      const etcTot = vnTotal - prodTot;
      const pte = $("#mr-prodT", main); if (pte) pte.textContent = won(prodTot);
      const ete = $("#mr-etcT", main); if (ete) ete.textContent = won(etcTot);
      $$(".mr-chpct", main).forEach((el) => { const r = R.channels[+el.dataset.pi]; if (r) el.textContent = (chTotal ? (S.num(r.supply) / chTotal * 100).toFixed(1) : "0.0") + "%"; });
      $$(".mr-vnpct", main).forEach((el) => { const r = R.vendors[+el.dataset.pi]; if (!r) return; const base = el.dataset.grp === "etc" ? etcTot : prodTot; el.textContent = (base ? (S.num(r.supply) / base * 100).toFixed(1) : "0.0") + "%"; });
      const mw = $("#mr-memo-wrap", main); if (mw) mw.classList.toggle("no-print", !String(R.memo || "").trim());
      const net = S.num(R.bank.inSum) - S.num(R.bank.outSum);
      const be = $("#mr-bankNet", main); if (be) { be.textContent = won(net); be.className = "n " + (net >= 0 ? "pos" : "neg"); }
      const pfFeeT = R.platform.filter((r) => r.type !== "광고비").reduce((a, r) => a + S.num(r.amount), 0);
      const pfAdT = R.platform.filter((r) => r.type === "광고비").reduce((a, r) => a + S.num(r.amount), 0);
      const fe = $("#mr-pfFee", main); if (fe) fe.textContent = won(pfFeeT);
      const ae = $("#mr-pfAd", main); if (ae) ae.textContent = won(pfAdT);
      $$(".mr-pfpct", main).forEach((el) => { const r = R.platform[+el.dataset.pi]; if (!r) return; const base = el.dataset.grp === "ad" ? pfAdT : pfFeeT; el.textContent = (base ? (S.num(r.amount) / base * 100).toFixed(1) : "0.0") + "%"; });
    };
    main.querySelectorAll(".mr-in").forEach((el) => {
      const upd = () => {
        const sec = el.dataset.sec, i = +el.dataset.i, f = el.dataset.f;
        const isNum = el.classList.contains("n") || /Cnt|Sum|count|supply|sales|purchase|amount/.test(f);
        const val = isNum ? S.num(el.value) : el.value;
        if (sec === "totals") R[f] = val;
        else if (sec === "bank") R.bank[f] = val;
        else if (sec === "memo") R.memo = val;
        else R[sec][i][f] = val;
      };
      el.addEventListener("input", () => { upd(); recalc(); S.save(true); });
      // 구분(수수료/광고비) 변경 시 해당 그룹으로 이동하도록 다시 그림
      if (el.tagName === "SELECT") el.addEventListener("change", () => { upd(); reSave(true); });
    });
    main.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => {
      const sec = b.dataset.add;
      R[sec].push(sec === "vendors" ? { name: "", note: "", count: 0, supply: 0 } : { name: "", count: 0, supply: 0 });
      reSave(true);
    }));
    main.querySelectorAll("[data-addpf]").forEach((b) => b.addEventListener("click", () => {
      R.platform.push({ supplier: "", item: "", type: b.dataset.addpf, amount: 0 });
      reSave(true);
    }));
    main.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
      R[b.dataset.rm].splice(+b.dataset.i, 1); reSave(true);
    }));
    $("#mr-print", main).addEventListener("click", () => window.print());
    $("#mr-png", main).addEventListener("click", () => exportSheetPng(main, `${fullNm}_${yr}-${mo}`));
    $("#mr-auto", main).addEventListener("click", () => {
      if (!confirm(`${fullNm}의 수기 보고서를 현재 데이터 자동값으로 다시 채울까요? 지금 입력한 값은 덮어써져요. (플랫폼 세부내역은 유지됩니다)`)) return;
      const keepPf = R.platform;
      M[store] = autoFillStoreReport(store, yr, mo);
      M[store].platform = keepPf || [];
      reSave(true);
    });
    // 채널별 매출 추이·구성 + 플랫폼 비중 차트
    requestAnimationFrame(() => {
      salesTrendChart("mr-trend", trendSales(store));
      const chGroups = R.channels.filter((c) => S.num(c.supply) > 0)
        .map((c) => ({ key: c.name || "(미입력)", sum: S.num(c.supply) }))
        .sort((a, b) => b.sum - a.sum);
      pastelDoughnut("mr-ch-ch", chGroups);
      pastelDoughnut("mr-pf-ch", pfChart);
    });
  }

  // 통합 수기 보고서 (그로븐+YB 자동 합산, 읽기 전용)
  function renderManualCombined(main, M, ym, yr, mo) {
    const g = M.groven, y = M.yb;
    // 매출=채널별 합계, 매입=매입처별 합계 (자동)
    const sSum = (R) => (R.channels || []).reduce((a, r) => a + S.num(r.supply), 0);
    const pSum = (R) => (R.vendors || []).reduce((a, r) => a + S.num(r.supply), 0);
    const incRows = [["groven", "그로븐", "면세", g], ["yb", "옐로우브릿지", "과세", y]];
    const incBody = incRows.map(([st, nm, tax, R]) => {
      const sv = sSum(R), pv = pSum(R), profit = sv - pv;
      const rate = sv ? Math.round((sv - pv) / sv * 100) : 0;
      return `<tr><td>${nm}</td><td>${tax}</td><td class="n">${won(sv)}</td><td class="n">${won(pv)}</td>
        <td class="n ${profit >= 0 ? "pos" : "neg"}">${won(profit)}</td><td class="n">${rate}%</td></tr>`;
    }).join("");
    const saleT = sSum(g) + sSum(y), buyT = pSum(g) + pSum(y);

    const chMerged = mergeDetail(g.channels, y.channels, false);
    const chT = chMerged.reduce((a, r) => a + S.num(r.supply), 0);
    const chBody = chMerged.map((r, i) => `<tr><td class="c">${i + 1}</td><td class="name">${esc(r.name)}</td>
      <td class="n">${won(r.count)}</td><td class="n">${won(r.supply)}</td>
      <td class="n">${chT ? (S.num(r.supply) / chT * 100).toFixed(1) : "0.0"}%</td></tr>`).join("");

    const vnMerged = mergeDetail(g.vendors, y.vendors, true);
    const vnT = vnMerged.reduce((a, r) => a + S.num(r.supply), 0);
    const vnIsProd = (r) => /상품매입/.test(r.note || "");
    const vnProd = vnMerged.filter(vnIsProd), vnEtc = vnMerged.filter((r) => !vnIsProd(r));
    const vnProdT = vnProd.reduce((a, r) => a + S.num(r.supply), 0);
    const vnEtcT = vnEtc.reduce((a, r) => a + S.num(r.supply), 0);
    const vnCRow = (r, n, grpT) => `<tr><td class="c">${n}</td><td class="name">${esc(r.name)}</td>
      <td class="name">${esc(r.note)}</td><td class="n">${won(r.count)}</td><td class="n">${won(r.supply)}</td>
      <td class="n">${grpT ? (S.num(r.supply) / grpT * 100).toFixed(1) : "0.0"}%</td></tr>`;
    const vnCGroup = (rows, label, grpT) => `<tr style="background:#eef4ff"><td colspan="6" style="font-weight:700;color:var(--navy);padding:5px 9px">${label}</td></tr>`
      + (rows.length ? rows.map((r, n) => vnCRow(r, n + 1, grpT)).join("") : `<tr><td colspan="6" class="empty">없음</td></tr>`);
    const vnBody = vnCGroup(vnProd, "▸ 상품매입", vnProdT)
      + `<tr class="sum"><td colspan="4">상품매입 소계</td><td class="n">${won(vnProdT)}</td><td class="n">100%</td></tr>`
      + vnCGroup(vnEtc, "▸ 수수료·광고비·기타", vnEtcT)
      + `<tr class="sum"><td colspan="4">기타 소계</td><td class="n">${won(vnEtcT)}</td><td class="n">100%</td></tr>`;

    const bk = {
      inCnt: S.num(g.bank.inCnt) + S.num(y.bank.inCnt), inSum: S.num(g.bank.inSum) + S.num(y.bank.inSum),
      outCnt: S.num(g.bank.outCnt) + S.num(y.bank.outCnt), outSum: S.num(g.bank.outSum) + S.num(y.bank.outSum),
    };
    const memo = [g.memo, y.memo].filter(Boolean).join("\n");

    const pfRaw = [].concat(g.platform || [], y.platform || []);
    // 공급자+품목+구분이 같으면 합치기 (앞뒤·중간 공백 차이는 무시)
    const pfNorm = (s) => String(s || "").trim().replace(/\s+/g, " ");
    const pfMap = {};
    pfRaw.forEach((r) => {
      const sup = pfNorm(r.supplier), it = pfNorm(r.item), ty = r.type || "수수료";
      const k = `${sup}|${it}|${ty}`;
      if (!pfMap[k]) pfMap[k] = { supplier: sup, item: it, type: ty, amount: 0 };
      pfMap[k].amount += S.num(r.amount);
    });
    const pf = Object.values(pfMap);
    // 구분 안에서 공급자별로 합치기 (품목·구분 반복 제거 → 공급자+금액만)
    const pfBySup = (type) => {
      const m = {};
      pf.filter((r) => type === "광고비" ? r.type === "광고비" : r.type !== "광고비")
        .forEach((r) => { m[r.supplier] = (m[r.supplier] || 0) + S.num(r.amount); });
      return Object.entries(m).map(([k, v]) => ({ key: k, sum: v })).sort((a, b) => b.sum - a.sum);
    };
    const feeSup = pfBySup("수수료"), adSup = pfBySup("광고비");
    const pfFee = feeSup.reduce((a, g) => a + g.sum, 0), pfAd = adSup.reduce((a, g) => a + g.sum, 0);
    // 도넛용: 공급자별 총액(수수료+광고비), 양수만
    const supTotMap = {};
    pf.forEach((r) => { supTotMap[r.supplier] = (supTotMap[r.supplier] || 0) + S.num(r.amount); });
    const pfChart = Object.entries(supTotMap).map(([k, v]) => ({ key: k, sum: v }))
      .filter((g) => g.sum > 0).sort((a, b) => b.sum - a.sum);
    const supGrp = (rows, label, grpT) => `<tr style="background:#eef4ff"><td colspan="4" style="font-weight:700;color:var(--navy);padding:5px 9px">${label}</td></tr>`
      + (rows.length ? rows.map((g, n) => `<tr><td class="c">${n + 1}</td><td class="name">${esc(g.key)}</td><td class="n">${won(g.sum)}</td><td class="n">${grpT ? (g.sum / grpT * 100).toFixed(1) : "0.0"}%</td></tr>`).join("") : `<tr><td colspan="4" class="empty">없음</td></tr>`);
    const pfSection = pf.length ? `
        <h4 class="doc-sec">Ⅲ-1. 플랫폼 수수료·광고비 세부</h4>
        <div class="mr-chart-row" style="display:flex;gap:14px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <table class="doc-table"><thead><tr><th class="c" style="width:40px">순번</th><th>플랫폼</th><th class="n" style="width:130px">금액</th><th class="n" style="width:60px">비중</th></tr></thead>
              <tbody>${supGrp(feeSup, "▸ 플랫폼 수수료", pfFee)}<tr class="sum"><td colspan="2">수수료 소계</td><td class="n">${won(pfFee)}</td><td class="n">100%</td></tr>
              ${supGrp(adSup, "▸ 플랫폼 광고비", pfAd)}<tr class="sum"><td colspan="2">광고비 소계</td><td class="n">${won(pfAd)}</td><td class="n">100%</td></tr></tbody></table>
          </div>
          <div style="width:240px;flex-shrink:0">
            <div style="position:relative;border:1px solid #d4dae4;border-radius:6px;padding:8px;height:260px"><canvas id="mr-pf-ch"></canvas></div>
            <div class="muted" style="font-size:10px;text-align:center;margin-top:4px">플랫폼별 수수료·광고비 비용</div>
          </div>
        </div>` : "";

    main.innerHTML = `
      <div class="page-head no-print">
        <div><h2>📝 마감보고서(수기) · 통합 <span class="muted">${yr}년 ${mo}월</span></h2>
          <div class="muted">그로븐 · YB 수기 보고서를 자동 합산한 결과예요. (수정은 위 <b>그로븐 / 옐로우브릿지</b> 탭에서)</div></div>
        <div class="row-actions"><button class="btn" id="mr-png">📸 PNG 저장</button><button class="btn primary" id="mr-print">🖨️ 인쇄</button></div>
      </div>
      <div class="sheet">
        <div class="doc-head"><h1>${mo}월 마감 보고서</h1><div class="doc-sub">그로븐 · 옐로우브릿지 ${yr}년 ${mo}월 통합</div></div>
        <div class="doc-meta"><div class="meta"><div><b>대상월</b> ${yr}년 ${mo}월</div>
          <div><b>사업장</b> 그로븐(면세) · 옐로우브릿지(과세)</div><div><b>작성일</b> ${new Date().toLocaleDateString("ko-KR")}</div></div>
          <div class="approval"><div class="c head2">결재</div><div class="c"><div class="h">작성</div><div class="s"></div></div><div class="c"><div class="h">검토</div><div class="s"></div></div><div class="c"><div class="h">대표</div><div class="s"></div></div></div>
        </div>
        <h4 class="doc-sec">Ⅰ. 손익 요약 (공급가 기준)</h4>
        <table class="doc-table"><thead><tr><th>사업장</th><th>구분</th><th class="n">매출</th><th class="n">매입</th><th class="n">손익</th><th class="n">마진율</th></tr></thead>
          <tbody>${incBody}<tr class="sum"><td colspan="2">합계</td><td class="n">${won(saleT)}</td><td class="n">${won(buyT)}</td>
            <td class="n ${saleT - buyT >= 0 ? "pos" : "neg"}">${won(saleT - buyT)}</td><td class="n">${saleT ? Math.round((saleT - buyT) / saleT * 100) : 0}%</td></tr></tbody></table>

        <h4 class="doc-sec">Ⅱ. 채널별 매출</h4>
        <table class="doc-table"><thead><tr><th class="c" style="width:40px">순번</th><th>채널</th><th class="n" style="width:80px">건수</th><th class="n" style="width:130px">공급가</th><th class="n" style="width:64px">비중</th></tr></thead>
          <tbody>${chBody || `<tr><td colspan="5" class="empty">자료 없음</td></tr>`}<tr class="sum"><td colspan="3">합계</td><td class="n">${won(chT)}</td><td class="n">100%</td></tr></tbody></table>

        <h4 class="doc-sec">Ⅱ-1. 채널별 매출 추이·구성</h4>
        <div class="mr-chart-row" style="display:flex;gap:14px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div style="position:relative;border:1px solid #d4dae4;border-radius:6px;padding:8px;height:240px"><canvas id="mr-trend"></canvas></div>
            <div class="muted" style="font-size:10px;text-align:center;margin-top:4px">월별 매출 추이 (통합)</div>
          </div>
          <div style="width:240px;flex-shrink:0">
            <div style="position:relative;border:1px solid #d4dae4;border-radius:6px;padding:8px;height:240px"><canvas id="mr-ch-ch"></canvas></div>
            <div class="muted" style="font-size:10px;text-align:center;margin-top:4px">채널별 매출 비중</div>
          </div>
        </div>

        <h4 class="doc-sec">Ⅲ. 공급처별 매입</h4>
        <table class="doc-table"><thead><tr><th class="c" style="width:40px">순번</th><th style="width:132px">공급처</th><th>내용</th><th class="n" style="width:64px">건수</th><th class="n" style="width:110px">공급가</th><th class="n" style="width:56px">비중</th></tr></thead>
          <tbody>${vnBody}<tr class="sum"><td colspan="4">합계</td><td class="n">${won(vnT)}</td><td class="n"></td></tr></tbody></table>
        ${pfSection}
        ${memo ? `<h4 class="doc-sec">Ⅳ. 비고</h4><div style="white-space:pre-wrap;font-size:12px;padding:4px 2px">${esc(memo)}</div>` : ""}
      </div>`;
    $("#mr-print", main).addEventListener("click", () => window.print());
    $("#mr-png", main).addEventListener("click", () => exportSheetPng(main, `통합_${yr}-${mo}`));
    requestAnimationFrame(() => {
      salesTrendChart("mr-trend", trendSales(""));
      const chGroups = chMerged.filter((c) => S.num(c.supply) > 0)
        .map((c) => ({ key: c.name || "(미입력)", sum: S.num(c.supply) })).sort((a, b) => b.sum - a.sum);
      pastelDoughnut("mr-ch-ch", chGroups);
      pastelDoughnut("mr-pf-ch", pfChart);
    });
  }

  function renderReport(main) {
    const { store, year, month } = scope;
    const sales = S.filterBy(S.data.sales, { store, year, month });
    const purch = S.filterBy(S.data.purchases, { store, year, month });
    const txns = S.filterBy(S.data.transactions, { store, year, month });
    const byChannel = S.groupSum(sales, "channel", "supply");
    const byVendor = S.groupSum(purch, "vendor", "supply");
    const inSum = S.sum(txns.filter((t) => t.type === "in"), "amount");
    const outSum = S.sum(txns.filter((t) => t.type === "out"), "amount");
    const inCnt = txns.filter((t) => t.type === "in").length;
    const summary = ["groven", "yb"].map((st) => {
      const sl = S.filterBy(S.data.sales, { store: st, year, month });
      const pl = S.filterBy(S.data.purchases, { store: st, year, month });
      const v = S.sum(sl, "supply"), p = S.sum(pl, "supply");
      return { nm: S.STORES[st].name, tax: S.STORES[st].taxType, v, p, profit: v - p };
    });
    const tSv = summary.reduce((a, r) => a + r.v, 0), tPv = summary.reduce((a, r) => a + r.p, 0);

    const grp = (rows, label, sumTotal, itemsOf) => {
      const hi = !!itemsOf;
      return `
      <table class="doc-table"><thead><tr><th class="c" style="width:48px">순번</th><th>${label}</th>${hi ? `<th style="width:128px">내용</th>` : ""}<th class="n" style="width:54px">건수</th><th class="n" style="width:118px">공급가</th><th class="n" style="width:58px">비중</th></tr></thead>
      <tbody>${rows.length ? rows.map((g, i) => `<tr><td class="c">${i + 1}</td><td class="name">${esc(g.key)}</td>${hi ? `<td class="name">${esc(itemsOf(g.key))}</td>` : ""}
        <td class="n">${won(g.count)}</td><td class="n">${won(g.sum)}</td><td class="n">${(g.ratio * 100).toFixed(1)}%</td></tr>`).join("")
        : `<tr><td colspan="${hi ? 6 : 5}" class="empty">자료 없음</td></tr>`}
        <tr class="sum"><td colspan="${hi ? 3 : 2}">합계</td><td class="n">${won(rows.reduce((a, g) => a + g.count, 0))}</td>
        <td class="n">${won(sumTotal)}</td><td class="n">100%</td></tr></tbody></table>`;
    };

    const ttl = (scope.year || "____") + "년 " + (scope.month || "__") + "월";
    main.innerHTML = `
      <div class="page-head no-print">
        <div><h2>마감 보고서 <span class="muted">${esc(scopeLabel())}</span></h2></div>
        <div class="row-actions">
          <button class="btn primary" id="dl-xlsx">⬇️ 엑셀 다운로드</button>
          <button class="btn" onclick="window.print()">🖨️ 인쇄 / PDF</button>
        </div>
      </div>

      <div class="sheet">
        <div class="doc-head">
          <h1>월 마감 보고서</h1>
          <div class="doc-sub">SALES · PURCHASE MONTHLY CLOSING REPORT</div>
        </div>
        <div class="doc-meta">
          <div class="meta">
            <div><b>대상월</b> ${ttl}</div>
            <div><b>사업장</b> ${scope.store ? S.STORES[scope.store].name + " (" + S.STORES[scope.store].taxType + ")" : "그로븐(면세) · 옐로우브릿지(과세)"}</div>
            <div><b>작성일</b> ${new Date().toLocaleDateString("ko-KR")}</div>
          </div>
          <div class="approval">
            <div class="c head2">결재</div>
            <div class="c"><div class="h">작성</div><div class="s"></div></div>
            <div class="c"><div class="h">검토</div><div class="s"></div></div>
            <div class="c"><div class="h">대표</div><div class="s"></div></div>
          </div>
        </div>

        <h4 class="doc-sec">Ⅰ. 손익 요약 (공급가 기준)</h4>
        <table class="doc-table">
          <thead><tr><th>사업장</th><th>구분</th><th class="n">매출</th><th class="n">매입</th><th class="n">손익</th><th class="n">마진율</th></tr></thead>
          <tbody>
            ${summary.map((r) => `<tr><td>${r.nm}</td><td>${r.tax}</td>
              <td class="n">${won(r.v)}</td><td class="n">${won(r.p)}</td>
              <td class="n ${r.profit >= 0 ? "pos" : "neg"}">${r.profit >= 0 ? "+" : ""}${won(r.profit)}</td>
              <td class="n">${r.v ? Math.round((r.v - r.p) / r.v * 100) : 0}%</td></tr>`).join("")}
            <tr class="sum"><td>합계</td><td>-</td><td class="n">${won(tSv)}</td><td class="n">${won(tPv)}</td>
              <td class="n ${tSv - tPv >= 0 ? "pos" : "neg"}">${tSv - tPv >= 0 ? "+" : ""}${won(tSv - tPv)}</td>
              <td class="n">${tSv ? Math.round((tSv - tPv) / tSv * 100) : 0}%</td></tr>
          </tbody>
        </table>

        <h4 class="doc-sec">Ⅱ. 채널별 매출</h4>${grp(byChannel, "채널", tSv ? S.sum(sales, "supply") : 0)}
        <h4 class="doc-sec">Ⅲ. 공급처별 매입</h4>${grp(byVendor, "공급처", S.sum(purch, "supply"), (k) => S.data.vendorItems[k] || "")}

        <h4 class="doc-sec">Ⅳ. 추이 및 구성</h4>
        <div class="doc-charts">
          <div class="cbox"><canvas id="rp-trend"></canvas></div>
          <div class="cbox"><canvas id="rp-ch"></canvas></div>
        </div>

        <h4 class="doc-sec">Ⅴ. 입출금 정산 (기업은행)</h4>
        <table class="doc-table">
          <thead><tr><th>구분</th><th class="n">건수</th><th class="n">금액</th><th>비고</th></tr></thead>
          <tbody>
            <tr><td>입금 (매출 정산)</td><td class="n">${inCnt}</td><td class="n pos">${won(inSum)}</td><td>채널 정산 입금</td></tr>
            <tr><td>출금 (매입·비용)</td><td class="n">${txns.length - inCnt}</td><td class="n neg">${won(outSum)}</td><td>상품매입·고정비 등</td></tr>
            <tr class="sum"><td>순증감</td><td class="n">${txns.length}</td><td class="n ${inSum - outSum >= 0 ? "pos" : "neg"}">${inSum - outSum >= 0 ? "+" : ""}${won(inSum - outSum)}</td><td></td></tr>
          </tbody>
        </table>
        ${evidenceSection(store, year, month)}
        ${depositSection(store)}
      </div>`;

    $("#dl-xlsx").addEventListener("click", () => Report.download({ year, month }));
    // 차트 (구성 차트는 데이터 있는 쪽: 매출 채널 없으면 매입처)
    const monthly = S.monthlySummary(store);
    Dashboard.renderTrend("rp-trend", monthly);
    Dashboard.renderGroup("rp-ch", byChannel.length ? byChannel : byVendor, "doughnut");
  }

  /* ===================== 데이터 · 설정 ===================== */
  function renderData(main) {
    main.innerHTML = `
      <div class="page-head"><h2>데이터 · 설정</h2></div>
      <div class="card"><h3>자료 가져오기</h3>
        <div class="flow-actions">
          <button class="btn" data-act="import-existing">📂 기존 마감 엑셀 불러오기</button>
          <button class="btn" data-act="import-bank">🏦 기업은행 통장내역</button>
          <button class="btn" data-act="import-po">🧾 발주서로 매입 정리</button>
          <button class="btn" data-act="import-paste">📋 매입 직접 추가(붙여넣기)</button>
          <button class="btn" data-act="import-evidence">🧾 홈택스 증빙 대조</button>
        </div></div>
      <div class="card"><h3>공급처 내용 (취급품목)</h3>
        <p class="hint">공급처마다 내용(취급품목 등)을 적어두면 보고서 '공급처별 매입'의 내용 칸에 표시됩니다.</p>
        <div class="table-wrap scroll"><table class="grid"><thead><tr><th style="width:160px">공급처</th><th>내용</th></tr></thead>
        <tbody>${[...new Set(S.data.purchases.map((p) => p.vendor).filter(Boolean))].sort().map((v) =>
          `<tr><td>${esc(v)}</td><td><input class="vi-input" data-v="${esc(v)}" value="${esc(S.data.vendorItems[v] || "")}" placeholder="예: 간고등어, 굴비" style="width:100%;border:1px solid var(--line);border-radius:7px;padding:6px 9px;font-size:13px"></td></tr>`).join("") ||
          `<tr><td colspan="2" class="empty">매입 자료를 먼저 넣어주세요</td></tr>`}</tbody></table></div></div>
      <div class="card"><h3>🔁 고정비 · 정기결제 (매월 자동 반영)</h3>
        <p class="hint">임대료·구독·통신·주결제 업체 등 <b>매월 똑같이 나가는 항목</b>을 등록하면, 마감보고서 '자동값 불러오기' 때 자동으로 들어갑니다. 내용에 <b>'상품매입'</b>을 넣으면 상품매입 그룹, 아니면 기타(수수료·비용) 그룹으로 분류돼요.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
          <span><label style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">사업장</label><select id="fc-store" style="border:1px solid var(--line);border-radius:8px;padding:7px 9px"><option value="groven">그로븐</option><option value="yb">YB</option></select></span>
          <span style="flex:1;min-width:120px"><label style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">공급처</label><input id="fc-vendor" placeholder="예: 대우엔지니어링" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 9px"></span>
          <span style="flex:1;min-width:120px"><label style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">내용</label><input id="fc-note" placeholder="예: 공장임대료" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 9px"></span>
          <span style="width:70px"><label style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">건수</label><input id="fc-count" inputmode="numeric" value="1" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 9px;text-align:right"></span>
          <span style="width:120px"><label style="display:block;font-size:12px;color:var(--muted);margin-bottom:3px">금액</label><input id="fc-amount" inputmode="numeric" placeholder="0" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 9px;text-align:right"></span>
          <button class="btn primary" id="fc-add">➕ 추가</button>
        </div>
        <div class="table-wrap"><table class="grid"><thead><tr><th>사업장</th><th>공급처</th><th>내용</th><th class="num">건수</th><th class="num">금액</th><th></th></tr></thead>
          <tbody>${(S.data.fixedCosts || []).map((fc) => `<tr><td>${fc.store === "yb" ? "YB" : "그로븐"}</td><td>${esc(fc.vendor)}</td><td>${esc(fc.note || "")}</td>
            <td class="num">${won(fc.count)}</td><td class="num">₩${won(fc.amount)}</td>
            <td class="row-actions"><button class="icon-btn edit" data-editfc="${fc.id}" title="수정">✎</button><button class="icon-btn" data-delfc="${fc.id}" title="삭제">✕</button></td></tr>`).join("") ||
            `<tr><td colspan="6" class="empty">아직 없어요. 위에서 고정비를 등록하세요.</td></tr>`}</tbody></table></div></div>
      <div class="card"><h3>송금처 마스터 (${S.data.vendors.length}곳)</h3>
        <div class="table-wrap"><table class="grid"><thead><tr><th>송금처</th><th>은행</th><th>계좌번호</th></tr></thead>
        <tbody>${S.data.vendors.map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.bank)}</td><td>${esc(v.account)}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="card"><h3>백업 / 초기화</h3>
        <div class="flow-actions">
          <button class="btn" id="ex-json">💾 전체 백업(JSON)</button>
          <label class="btn">📥 백업 불러오기(덮어쓰기)<input type="file" id="im-json" accept=".json" hidden></label>
          <label class="btn">🔗 백업 합치기(merge)<input type="file" id="im-merge" accept=".json" hidden></label>
          <button class="btn danger" id="clr-pur">🧾 매입만 비우기</button>
          <button class="btn danger" id="clr">🗑️ 전체 삭제</button>
        </div>
        <p class="hint">데이터는 이 브라우저에만 저장됩니다. 다른 PC에서 쓰려면 백업 파일을 옮기세요.</p></div>`;
    wire(main);
    // 고정비 추가/수정/삭제
    if ($("#fc-add", main)) $("#fc-add", main).addEventListener("click", () => {
      const vendor = $("#fc-vendor", main).value.trim();
      const amount = S.num($("#fc-amount", main).value);
      if (!vendor || !amount) { alert("공급처와 금액을 입력하세요."); return; }
      S.data.fixedCosts.push({ id: S.uid(), store: $("#fc-store", main).value, vendor, note: $("#fc-note", main).value.trim(), count: S.num($("#fc-count", main).value) || 1, amount });
      S.save(); renderData(main);
    });
    $$("[data-editfc]", main).forEach((b) => b.addEventListener("click", () => Modals.editRow("fixedCosts", b.dataset.editfc)));
    $$("[data-delfc]", main).forEach((b) => b.addEventListener("click", () => {
      if (confirm("이 고정비를 삭제할까요?")) { S.remove("fixedCosts", b.dataset.delfc); renderData(main); }
    }));
    $("#ex-json").addEventListener("click", () => {
      const blob = new Blob([S.exportJSON()], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `매입매출_백업_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    });
    $("#im-json").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!confirm("현재 데이터를 백업 파일로 덮어씁니다. 계속할까요?")) return;
      S.importJSON(await f.text()); go("home");
    });
    $("#im-merge").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!confirm("백업 파일의 매출·매입·입출금을 현재 데이터에 합칩니다.\n(같은 자료를 두 번 합치면 중복되니 주의)\n계속할까요?")) return;
      S.importMergeJSON(await f.text()); go("home");
    });
    $$(".vi-input", main).forEach((el) => el.addEventListener("change", () => {
      S.data.vendorItems[el.dataset.v] = el.value.trim();
      S.save();
    }));
    $("#clr-pur").addEventListener("click", () => {
      if (confirm("매입 자료만 모두 비울까요? (매출·통장은 그대로 유지됩니다)")) { S.clearKind("purchases"); go("purchases"); }
    });
    $("#clr").addEventListener("click", () => {
      if (confirm("정말 모든 데이터를 삭제할까요? 되돌릴 수 없습니다.")) { S.clearAll(); go("home"); }
    });
  }

  /* ===================== 공통 이벤트 ===================== */
  function wire(main) {
    $$("[data-act]", main).forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.act === "import-existing") Modals.importExisting();
      else if (b.dataset.act === "import-bank") Modals.importBank();
      else if (b.dataset.act === "import-po") Modals.importPO();
      else if (b.dataset.act === "import-paste") Modals.importPaste();
      else if (b.dataset.act === "import-evidence") Modals.importEvidence();
      else if (b.dataset.act === "import-orders") Modals.importOrders();
      else if (b.dataset.act === "import-deposit-file") Modals.importDeposits();
      else if (b.dataset.act === "import-deposit-paste") Modals.importDepositPaste();
    }));
    $$("[data-go]", main).forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
  }

  function init() {
    // 고정해둔 연·월·스토어 복원
    const saved = loadSavedScope();
    if (saved.pinned) {
      scope.pinned = true;
      scope.store = saved.store || "";
      scope.year = saved.year || "";
      scope.month = saved.month || "";
    }
    $$(".store-tab").forEach((x) => x.classList.toggle("active", x.dataset.store === scope.store));
    const pin = $("#f-pin");
    pin.classList.toggle("active", scope.pinned);

    $$(".nav-item").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
    $$(".store-tab").forEach((b) => b.addEventListener("click", () => {
      scope.store = b.dataset.store;
      $$(".store-tab").forEach((x) => x.classList.toggle("active", x === b));
      saveScope(); render();
    }));
    $("#f-year").addEventListener("change", (e) => { scope.year = e.target.value; saveScope(); render(); });
    $("#f-month").addEventListener("change", (e) => { scope.month = e.target.value; saveScope(); render(); });
    pin.addEventListener("click", () => {
      scope.pinned = !scope.pinned;
      pin.classList.toggle("active", scope.pinned);
      pin.textContent = scope.pinned ? "📌 고정됨" : "📌 고정";
      saveScope();
    });
    pin.textContent = scope.pinned ? "📌 고정됨" : "📌 고정";
    document.addEventListener("spc:changed", render);
    go("home");
  }

  return { init, go, render, scope };
})();

document.addEventListener("DOMContentLoaded", App.init);
