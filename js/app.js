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
    else if (scope.view === "report") renderReport(main);
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
          `손익 <b>${sv - pv >= 0 ? "+" : ""}₩${won(sv - pv)}</b> · 원가율 ${sv ? Math.round(pv / sv * 100) : 0}%`,
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

    main.innerHTML = `
      <div class="page-head">
        <div><h2>${TITLES[kind]} <span class="muted">(${rows.length}건 · 합계 ₩${won(total)})</span></h2>
          <div class="muted">${esc(scopeLabel())} · 금액 큰 순</div></div>
        <div class="row-actions">${importBtn}</div>
      </div>
      <div class="table-wrap"><table class="grid">
        <thead><tr>${cols.map((c) => `<th class="${c[2] || ""}">${c[0]}</th>`).join("")}<th></th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr data-id="${r.id}">${cols.map((c) =>
          `<td class="${c[2] || ""}">${c[1](r, i)}</td>`).join("")}
          <td class="row-actions"><button class="icon-btn edit" data-edit="${r.id}" title="수정">✎</button>
          <button class="icon-btn" data-del="${r.id}" title="삭제">✕</button></td></tr>`).join("")}
        </tbody></table>${rows.length ? "" : `<p class="empty">데이터가 없습니다. 위 버튼으로 자료를 올려보세요.</p>`}</div>`;

    wire(main);
    $$("[data-edit]", main).forEach((b) => b.addEventListener("click", () => Modals.editRow(kind, b.dataset.edit)));
    $$("[data-del]", main).forEach((b) => b.addEventListener("click", () => {
      if (confirm("이 행을 삭제할까요?")) S.remove(kind, b.dataset.del);
    }));
  }

  /* ===================== 인쇄용 마감 보고서 (시안1) ===================== */
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

    const grp = (rows, label, sumTotal) => `
      <table class="doc-table"><thead><tr><th style="width:42px">순번</th><th>${label}</th><th class="n">건수</th><th class="n">공급가</th><th class="n" style="width:64px">비중</th></tr></thead>
      <tbody>${rows.length ? rows.map((g, i) => `<tr><td>${i + 1}</td><td>${esc(g.key)}</td>
        <td class="n">${g.count}</td><td class="n">${won(g.sum)}</td><td class="n">${(g.ratio * 100).toFixed(1)}%</td></tr>`).join("")
        : `<tr><td colspan="5" class="empty">자료 없음</td></tr>`}
        <tr class="sum"><td colspan="2">합계</td><td class="n">${rows.reduce((a, g) => a + g.count, 0)}</td>
        <td class="n">${won(sumTotal)}</td><td class="n">100%</td></tr></tbody></table>`;

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
          <thead><tr><th>사업장</th><th>구분</th><th class="n">매출</th><th class="n">매입</th><th class="n">손익</th><th class="n">원가율</th></tr></thead>
          <tbody>
            ${summary.map((r) => `<tr><td>${r.nm}</td><td>${r.tax}</td>
              <td class="n">${won(r.v)}</td><td class="n">${won(r.p)}</td>
              <td class="n ${r.profit >= 0 ? "pos" : "neg"}">${r.profit >= 0 ? "+" : ""}${won(r.profit)}</td>
              <td class="n">${r.v ? Math.round(r.p / r.v * 100) : 0}%</td></tr>`).join("")}
            <tr class="sum"><td>합계</td><td>-</td><td class="n">${won(tSv)}</td><td class="n">${won(tPv)}</td>
              <td class="n ${tSv - tPv >= 0 ? "pos" : "neg"}">${tSv - tPv >= 0 ? "+" : ""}${won(tSv - tPv)}</td>
              <td class="n">${tSv ? Math.round(tPv / tSv * 100) : 0}%</td></tr>
          </tbody>
        </table>

        <div class="doc-2col">
          <div><h4 class="doc-sec">Ⅱ. 채널별 매출</h4>${grp(byChannel, "채널", tSv ? S.sum(sales, "supply") : 0)}</div>
          <div><h4 class="doc-sec">Ⅲ. 매입처별 매입</h4>${grp(byVendor, "매입처", S.sum(purch, "supply"))}</div>
        </div>

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

        <div class="doc-foot">본 보고서는 자동 마감 시스템으로 생성되었습니다 · 그로븐 / 옐로우브릿지</div>
      </div>`;

    $("#dl-xlsx").addEventListener("click", () => Report.download({ year, month }));
    // 차트
    const monthly = S.monthlySummary(store);
    Dashboard.renderTrend("rp-trend", monthly);
    Dashboard.renderGroup("rp-ch", byChannel, "doughnut");
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
        </div></div>
      <div class="card"><h3>송금처 마스터 (${S.data.vendors.length}곳)</h3>
        <div class="table-wrap"><table class="grid"><thead><tr><th>송금처</th><th>은행</th><th>계좌번호</th></tr></thead>
        <tbody>${S.data.vendors.map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.bank)}</td><td>${esc(v.account)}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="card"><h3>백업 / 초기화</h3>
        <div class="flow-actions">
          <button class="btn" id="ex-json">💾 전체 백업(JSON)</button>
          <label class="btn">📥 백업 불러오기<input type="file" id="im-json" accept=".json" hidden></label>
          <button class="btn danger" id="clr-pur">🧾 매입만 비우기</button>
          <button class="btn danger" id="clr">🗑️ 전체 삭제</button>
        </div>
        <p class="hint">데이터는 이 브라우저에만 저장됩니다. 다른 PC에서 쓰려면 백업 파일을 옮기세요.</p></div>`;
    wire(main);
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
