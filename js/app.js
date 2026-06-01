/* =============================================================
 *  app.js — 화면 전환 / 표 / 업로드 흐름 / 전역 상태
 * ============================================================= */

const App = (function () {
  const S = SPC;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const won = (n) => Math.round(S.num(n)).toLocaleString("ko-KR");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // 전역 필터(범위)
  const scope = { store: "", year: "", month: "", view: "dashboard" };

  /* ---- 네비게이션 ---------------------------------------- */
  function go(view) {
    scope.view = view;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    render();
  }

  /* ---- 범위 셀렉터 옵션 채우기 ---------------------------- */
  function refreshScopeOptions() {
    const years = new Set(), months = new Set();
    [...S.data.sales, ...S.data.purchases, ...S.data.transactions].forEach((r) => {
      if (r.year) years.add(S.num(r.year)); if (r.month) months.add(S.num(r.month));
    });
    const yf = $("#f-year"), mf = $("#f-month");
    const cur = { y: yf.value, m: mf.value };
    yf.innerHTML = `<option value="">전체 연도</option>` +
      [...years].sort((a, b) => b - a).map((y) => `<option value="${y}">${y}년</option>`).join("");
    mf.innerHTML = `<option value="">전체 월</option>` +
      [...months].sort((a, b) => a - b).map((m) => `<option value="${m}">${m}월</option>`).join("");
    yf.value = cur.y; mf.value = cur.m;
  }

  /* ---- 메인 렌더 ------------------------------------------ */
  function render() {
    refreshScopeOptions();
    const main = $("#main");
    const empty = S.data.sales.length + S.data.purchases.length + S.data.transactions.length === 0;
    if (empty && scope.view === "dashboard") { renderWelcome(main); return; }

    if (scope.view === "dashboard") Dashboard.render(main, scope);
    else if (scope.view === "sales") renderTable(main, "sales");
    else if (scope.view === "purchases") renderTable(main, "purchases");
    else if (scope.view === "transactions") renderTable(main, "transactions");
    else if (scope.view === "report") renderReport(main);
    else if (scope.view === "data") renderData(main);
  }

  function renderWelcome(main) {
    main.innerHTML = `
      <div class="welcome card">
        <h2>👋 매입·매출 마감 대시보드에 오신 걸 환영합니다</h2>
        <p>아직 데이터가 없어요. 아래 중 하나로 시작하세요. <b>모든 자료는 이 브라우저 안에만 저장</b>되며 외부로 전송되지 않습니다.</p>
        <div class="welcome-actions">
          <button class="btn primary" data-act="import-existing">📂 기존 마감 엑셀 불러오기</button>
          <button class="btn" data-act="import-bank">🏦 기업은행 통장내역 올리기</button>
          <button class="btn" data-act="import-po">🧾 발주서로 매입 정리</button>
        </div>
        <p class="hint">그로븐(면세)·옐로우브릿지(과세) 두 스토어를 따로 관리합니다.</p>
      </div>`;
    $$("[data-act]", main).forEach((b) => b.addEventListener("click", () => handleAct(b.dataset.act)));
  }

  /* ---- 표 렌더 -------------------------------------------- */
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
  const TITLES = { sales: "매출 관리", purchases: "매입 관리", transactions: "입출금 내역" };

  function renderTable(main, kind) {
    let rows = S.filterBy(S.data[kind], { store: scope.store, year: scope.year, month: scope.month });
    rows = S.byAmountDesc(rows, SORT_FIELD[kind]); // 무조건 금액 큰 것부터
    const cols = COLS[kind];
    const total = S.sum(rows, SORT_FIELD[kind]);

    const importBtn = kind === "transactions"
      ? `<button class="btn primary" data-act="import-bank">🏦 통장내역 올리기</button>`
      : kind === "purchases"
      ? `<button class="btn primary" data-act="import-po">🧾 발주서 올리기</button>`
      : `<button class="btn" data-act="import-existing">📂 엑셀 불러오기</button>`;

    main.innerHTML = `
      <div class="toolbar">
        <h2>${TITLES[kind]} <span class="muted">(${rows.length}건 · 합계 ₩${won(total)})</span></h2>
        <div class="toolbar-actions">${importBtn}</div>
      </div>
      <div class="table-wrap"><table class="grid">
        <thead><tr>${cols.map((c) => `<th class="${c[2] || ""}">${c[0]}</th>`).join("")}<th></th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr data-id="${r.id}">${cols.map((c) =>
          `<td class="${c[2] || ""}">${c[1](r, i)}</td>`).join("")}
          <td><button class="icon-btn" data-del="${r.id}" title="삭제">✕</button></td></tr>`).join("")}
        </tbody>
      </table>${rows.length ? "" : `<p class="empty">데이터가 없습니다.</p>`}</div>`;

    $$("[data-act]", main).forEach((b) => b.addEventListener("click", () => handleAct(b.dataset.act)));
    $$("[data-del]", main).forEach((b) => b.addEventListener("click", () => {
      if (confirm("이 행을 삭제할까요?")) S.remove(kind, b.dataset.del);
    }));
  }

  /* ---- 보고서 화면 ---------------------------------------- */
  function renderReport(main) {
    const wb = Report.buildWorkbook({ year: scope.year, month: scope.month });
    // 요약 미리보기
    const summary = ["groven", "yb"].map((st) => {
      const sl = S.filterBy(S.data.sales, { store: st, year: scope.year, month: scope.month });
      const pl = S.filterBy(S.data.purchases, { store: st, year: scope.year, month: scope.month });
      const sv = S.sum(sl, "supply") || S.sum(sl, "total");
      const pv = S.sum(pl, "supply") || S.sum(pl, "total");
      return { st, nm: S.STORES[st].name, tax: S.STORES[st].taxType, sv, pv, profit: sv - pv, sc: sl.length, pc: pl.length };
    });
    main.innerHTML = `
      <div class="toolbar">
        <h2>월 마감 보고서</h2>
        <div class="toolbar-actions">
          <button class="btn primary" id="btn-dl-report">⬇️ 엑셀 보고서 다운로드</button>
          <button class="btn" onclick="window.print()">🖨️ 인쇄</button>
        </div>
      </div>
      <div class="card report-summary">
        <h3>${scope.year || "전체"}년 ${scope.month || "전체"}월 요약</h3>
        <table class="grid">
          <thead><tr><th>스토어</th><th>구분</th><th class="num">매출(공급가)</th><th class="num">매입(공급가)</th><th class="num">손익</th><th class="num">매출건수</th><th class="num">매입건수</th></tr></thead>
          <tbody>${summary.map((r) => `<tr><td>${r.nm}</td><td>${r.tax}</td>
            <td class="num">₩${won(r.sv)}</td><td class="num">₩${won(r.pv)}</td>
            <td class="num ${r.profit >= 0 ? "pos" : "neg"}">₩${won(r.profit)}</td>
            <td class="num">${r.sc}</td><td class="num">${r.pc}</td></tr>`).join("")}
            <tr class="total-row"><td>합계</td><td>-</td>
              <td class="num">₩${won(summary.reduce((a, r) => a + r.sv, 0))}</td>
              <td class="num">₩${won(summary.reduce((a, r) => a + r.pv, 0))}</td>
              <td class="num">₩${won(summary.reduce((a, r) => a + r.profit, 0))}</td>
              <td class="num">${summary.reduce((a, r) => a + r.sc, 0)}</td>
              <td class="num">${summary.reduce((a, r) => a + r.pc, 0)}</td></tr>
          </tbody>
        </table>
        <p class="hint">엑셀 보고서에는 스토어별 매출/매입/입출금 시트(모두 금액 큰 순 정렬)와 월별 재무현황이 포함됩니다.</p>
      </div>
      <div id="report-charts"></div>`;
    $("#btn-dl-report").addEventListener("click", () => Report.download({ year: scope.year, month: scope.month }));
    Dashboard.render($("#report-charts"), scope);
  }

  /* ---- 데이터/설정 화면 ----------------------------------- */
  function renderData(main) {
    main.innerHTML = `
      <div class="toolbar"><h2>데이터 · 설정</h2></div>
      <div class="card">
        <h3>가져오기</h3>
        <div class="welcome-actions">
          <button class="btn" data-act="import-existing">📂 기존 마감 엑셀 불러오기</button>
          <button class="btn" data-act="import-bank">🏦 기업은행 통장내역 올리기</button>
          <button class="btn" data-act="import-po">🧾 발주서로 매입 정리</button>
        </div>
      </div>
      <div class="card">
        <h3>송금처 마스터 (${S.data.vendors.length}곳)</h3>
        <div class="table-wrap"><table class="grid"><thead><tr><th>송금처</th><th>은행</th><th>계좌번호</th></tr></thead>
        <tbody>${S.data.vendors.map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.bank)}</td><td>${esc(v.account)}</td></tr>`).join("")}</tbody></table></div>
      </div>
      <div class="card">
        <h3>백업 / 초기화</h3>
        <div class="welcome-actions">
          <button class="btn" id="btn-export-json">💾 전체 백업(JSON) 내보내기</button>
          <label class="btn">📥 백업 불러오기<input type="file" id="file-json" accept=".json" hidden></label>
          <button class="btn danger" id="btn-clear">🗑️ 전체 삭제</button>
        </div>
        <p class="hint">데이터는 이 브라우저(localStorage)에만 저장됩니다. 다른 PC에서 쓰려면 백업 파일을 옮기세요.</p>
      </div>`;
    $$("[data-act]", main).forEach((b) => b.addEventListener("click", () => handleAct(b.dataset.act)));
    $("#btn-export-json").addEventListener("click", () => {
      const blob = new Blob([S.exportJSON()], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `매입매출_백업_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    });
    $("#file-json").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!confirm("현재 데이터를 백업 파일로 덮어씁니다. 계속할까요?")) return;
      S.importJSON(await f.text()); go("dashboard");
    });
    $("#btn-clear").addEventListener("click", () => {
      if (confirm("정말 모든 데이터를 삭제할까요? 되돌릴 수 없습니다.")) { S.clearAll(); go("dashboard"); }
    });
  }

  /* ---- 업로드 액션 라우팅 --------------------------------- */
  function handleAct(act) {
    if (act === "import-existing") Modals.importExisting();
    else if (act === "import-bank") Modals.importBank();
    else if (act === "import-po") Modals.importPO();
  }

  /* ---- 초기화 -------------------------------------------- */
  function init() {
    $$(".nav-item").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
    $$(".store-tab").forEach((b) => b.addEventListener("click", () => {
      scope.store = b.dataset.store;
      $$(".store-tab").forEach((x) => x.classList.toggle("active", x === b));
      render();
    }));
    $("#f-year").addEventListener("change", (e) => { scope.year = e.target.value; render(); });
    $("#f-month").addEventListener("change", (e) => { scope.month = e.target.value; render(); });
    document.addEventListener("spc:changed", render);
    go("dashboard");
  }

  return { init, go, render, scope, $, $$, won, esc };
})();

document.addEventListener("DOMContentLoaded", App.init);
