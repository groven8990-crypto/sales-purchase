/* =============================================================
 *  dashboard.js — KPI 카드 + 차트 렌더링 (Chart.js)
 * ============================================================= */

const Dashboard = (function () {
  let charts = {};
  const won = (n) => "₩" + Math.round(n).toLocaleString("ko-KR");
  const cheon = (n) => Math.round(n).toLocaleString("ko-KR"); // 원 단위

  const PALETTE = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6",
                   "#0891b2", "#db2777", "#65a30d", "#ea580c", "#475569"];

  function destroy() {
    Object.values(charts).forEach((c) => c && c.destroy());
    charts = {};
  }

  function kpiCard(label, value, sub, tone) {
    return `<div class="kpi ${tone || ""}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-sub">${sub || ""}</div>
    </div>`;
  }

  function render(container, scope) {
    destroy();
    const { store, year, month } = scope; // 선택된 스토어·연·월 모두 반영
    const S = SPC;
    const sales = S.filterBy(S.data.sales, { store, year, month });
    const purchases = S.filterBy(S.data.purchases, { store, year, month });

    const totalSales = S.sum(sales, "supply") || S.sum(sales, "total");
    const totalPurchase = S.sum(purchases, "supply") || S.sum(purchases, "total");
    const profit = totalSales - totalPurchase;
    const unsettled = S.sum(sales.filter(r => r.settled !== "완료" && r.settled !== "정산완료"), "unsettled");

    container.innerHTML = `
      <div class="kpi-grid">
        ${kpiCard("총 매출 (공급가)", won(totalSales), `${sales.length}건`, "blue")}
        ${kpiCard("총 매입 (공급가)", won(totalPurchase), `${purchases.length}건`, "amber")}
        ${kpiCard("손익 (매출-매입)", won(profit), profit >= 0 ? "흑자" : "적자", profit >= 0 ? "green" : "red")}
        ${kpiCard("매입/매출 비율", totalSales ? Math.round(totalPurchase / totalSales * 100) + "%" : "-", "원가율", "slate")}
      </div>
      <div class="chart-grid">
        <div class="card"><h3>월별 매출·매입 추이</h3><canvas id="ch-trend"></canvas></div>
        <div class="card"><h3>스토어별 매출 비중</h3><canvas id="ch-store"></canvas></div>
        <div class="card"><h3>채널별 매출</h3><canvas id="ch-channel"></canvas></div>
        <div class="card"><h3>매입 분류별 비중</h3><canvas id="ch-cat"></canvas></div>
        <div class="card wide"><h3>누적 손익</h3><canvas id="ch-cum"></canvas></div>
      </div>`;

    /* 월별 추이 */
    const monthly = S.monthlySummary(store);
    const labels = monthly.map((r) => `${r.y}.${r.m}`);
    charts.trend = new Chart(document.getElementById("ch-trend"), {
      type: "bar",
      data: { labels, datasets: [
        { label: "매출", data: monthly.map((r) => r.sales), backgroundColor: PALETTE[0] },
        { label: "매입", data: monthly.map((r) => r.purchase), backgroundColor: PALETTE[2] },
      ]},
      options: baseOpts(),
    });

    /* 스토어별 비중 (선택 기간 기준) */
    const byStore = ["groven", "yb"].map((k) =>
      S.sum(S.filterBy(S.data.sales, { store: k, year, month }), "supply"));
    charts.store = new Chart(document.getElementById("ch-store"), {
      type: "doughnut",
      data: { labels: ["그로븐(면세)", "옐로우브릿지(과세)"],
        datasets: [{ data: byStore, backgroundColor: [PALETTE[1], PALETTE[4]] }] },
      options: { plugins: { legend: { position: "bottom" } } },
    });

    /* 채널별 매출 */
    const chMap = {};
    sales.forEach((r) => { chMap[r.channel || "기타"] = (chMap[r.channel || "기타"] || 0) + S.num(r.supply || r.total); });
    const chEntries = Object.entries(chMap).sort((a, b) => b[1] - a[1]);
    charts.channel = new Chart(document.getElementById("ch-channel"), {
      type: "bar",
      data: { labels: chEntries.map((e) => e[0]),
        datasets: [{ label: "매출", data: chEntries.map((e) => e[1]),
          backgroundColor: chEntries.map((_, i) => PALETTE[i % PALETTE.length]) }] },
      options: baseOpts(true),
    });

    /* 매입 분류별 */
    const catMap = {};
    purchases.forEach((r) => { catMap[r.category || "기타"] = (catMap[r.category || "기타"] || 0) + S.num(r.supply || r.total); });
    const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    charts.cat = new Chart(document.getElementById("ch-cat"), {
      type: "doughnut",
      data: { labels: catEntries.map((e) => e[0]),
        datasets: [{ data: catEntries.map((e) => e[1]),
          backgroundColor: catEntries.map((_, i) => PALETTE[i % PALETTE.length]) }] },
      options: { plugins: { legend: { position: "right" } } },
    });

    /* 누적 손익 */
    charts.cum = new Chart(document.getElementById("ch-cum"), {
      type: "line",
      data: { labels, datasets: [
        { label: "누적손익", data: monthly.map((r) => r.cumulative),
          borderColor: PALETTE[1], backgroundColor: "rgba(22,163,74,.1)", fill: true, tension: .3 },
        { label: "월 손익", data: monthly.map((r) => r.profit),
          borderColor: PALETTE[3], tension: .3 },
      ]},
      options: baseOpts(),
    });
  }

  function baseOpts(horizontal) {
    // 값이 표시되는 축(가로막대=x, 세로막대=y)에만 천단위 숫자 서식 적용
    const valueTicks = { callback: (v) => cheon(v) };
    return {
      indexAxis: horizontal ? "y" : "x",
      plugins: { legend: { position: "bottom" },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label || ""}: ${won(c.parsed.y ?? c.parsed.x ?? c.parsed)}` } } },
      scales: horizontal ? { x: { ticks: valueTicks } } : { y: { ticks: valueTicks } },
      responsive: true, maintainAspectRatio: false,
    };
  }

  // 월별 매출·매입 추이 (보고서용)
  function renderTrend(canvasId, monthly) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(el, {
      data: {
        labels: monthly.map((r) => `${String(r.y).slice(2)}.${r.m}`),
        datasets: [
          { type: "bar", label: "매출", data: monthly.map((r) => r.sales), backgroundColor: "#1a3a6b", borderRadius: 4, maxBarThickness: 26 },
          { type: "bar", label: "매입", data: monthly.map((r) => r.purchase), backgroundColor: "#9aa7bd", borderRadius: 4, maxBarThickness: 26 },
          { type: "line", label: "손익", data: monthly.map((r) => r.profit), borderColor: "#0ea5a5", backgroundColor: "#0ea5a5", tension: .3 },
        ],
      },
      options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: { y: { ticks: { font: { size: 10 }, callback: (v) => cheon(v) } }, x: { ticks: { font: { size: 10 } } } },
        responsive: true, maintainAspectRatio: false },
    });
  }

  // 그룹 집계(채널별/매입처별) 단독 차트
  function renderGroup(canvasId, groups, type) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    if (charts[canvasId]) charts[canvasId].destroy();
    const labels = groups.map((g) => g.key);
    const data = groups.map((g) => g.sum);
    const colors = groups.map((_, i) => PALETTE[i % PALETTE.length]);
    charts[canvasId] = new Chart(el, type === "doughnut" ? {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors }] },
      options: { plugins: { legend: { position: "right" },
        tooltip: { callbacks: { label: (c) => `${c.label}: ${won(c.parsed)}` } } },
        responsive: true, maintainAspectRatio: false },
    } : {
      type: "bar",
      data: { labels, datasets: [{ label: "금액", data, backgroundColor: colors }] },
      options: { indexAxis: "y", plugins: { legend: { display: false },
        tooltip: { callbacks: { label: (c) => won(c.parsed.x) } } },
        scales: { x: { ticks: { callback: (v) => cheon(v) } } },
        responsive: true, maintainAspectRatio: false },
    });
  }

  return { render, renderTrend, renderGroup, destroy, won };
})();
