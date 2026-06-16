/* =============================================================
 *  modals.js — 업로드/미리보기/매핑 대화상자
 * ============================================================= */

const Modals = (function () {
  const S = SPC;
  const E = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const won = (n) => Math.round(S.num(n)).toLocaleString("ko-KR");

  let host;
  function open(title, bodyHtml, footerHtml) {
    if (!host) {
      host = document.createElement("div");
      host.className = "modal-host";
      document.body.appendChild(host);
    }
    host.innerHTML = `<div class="modal-backdrop"></div>
      <div class="modal" role="dialog">
        <div class="modal-head"><h3>${title}</h3><button class="icon-btn" id="m-close">✕</button></div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-foot">${footerHtml || ""}</div>
      </div>`;
    host.style.display = "block";
    host.querySelector("#m-close").onclick = close;
    host.querySelector(".modal-backdrop").onclick = close;
  }
  function close() { if (host) host.style.display = "none"; }
  const q = (sel) => host.querySelector(sel);

  function storeSelect(id, def = "groven") {
    return `<select id="${id}">
      <option value="groven" ${def === "groven" ? "selected" : ""}>그로븐 (면세)</option>
      <option value="yb" ${def === "yb" ? "selected" : ""}>옐로우브릿지 (과세)</option>
    </select>`;
  }
  // 파일명에서 거래처 추출 (날짜·스토어·발주서 등 제외하고 첫 의미있는 토큰)
  function fileVendor(name) {
    const base = String(name).replace(/\.[^.]+$/, "");
    const toks = base.split(/[-_\s]+/).filter(Boolean);
    const skip = /^\d+$|발주서|정산|회신|주문|내역서?|그로븐|옐로우브릿지|옐브|면세|과세|grov|groven|yellow|bridge|^yb$/i;
    return (toks.find((x) => !skip.test(x) && /[가-힣A-Za-z]/.test(x)) || "");
  }
  // 기본 연/월 선택 (드롭다운) — 상단 스코프/마지막 입력값을 기본값으로
  let lastYM = null;
  function ymSelect(yId, mId) {
    const sc = (typeof App !== "undefined" && App.scope) ? App.scope : {};
    const now = new Date();
    const y = +(sc.year || (lastYM && lastYM.y) || now.getFullYear());
    const m = +(sc.month || (lastYM && lastYM.m) || (now.getMonth() + 1));
    const years = []; for (let yy = now.getFullYear() + 1; yy >= now.getFullYear() - 3; yy--) years.push(yy);
    return `<select id="${yId}" style="padding:7px 9px;border:1px solid var(--line);border-radius:8px">${years.map((yy) => `<option value="${yy}" ${yy === y ? "selected" : ""}>${yy}년</option>`).join("")}</select>` +
      `<select id="${mId}" style="padding:7px 9px;border:1px solid var(--line);border-radius:8px;margin-left:5px">${Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => `<option value="${mm}" ${mm === m ? "selected" : ""}>${mm}월</option>`).join("")}</select>`;
  }

  /* ===== 1) 기존 마감 엑셀 불러오기 ===== */
  function importExisting() {
    open("기존 마감 엑셀 불러오기",
      `<p>현재 쓰시던 <b>그로븐 / 옐로우브릿지(YB)</b> 엑셀 파일을 올리면 매출·매입·입출금·송금처를 한 번에 가져옵니다.</p>
       <div class="form-row"><label>스토어</label>${storeSelect("ie-store")}</div>
       <div class="form-row"><label>엑셀 파일</label><input type="file" id="ie-file" accept=".xlsx,.xls"></div>
       <div id="ie-preview" class="preview"></div>`,
      `<button class="btn" id="ie-cancel">취소</button>
       <button class="btn primary" id="ie-apply" disabled>가져오기</button>`);
    let parsed = null;
    q("#ie-file").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const store = q("#ie-store").value;
      try {
        parsed = await Parsers.importExistingWorkbook(f, store);
        q("#ie-preview").innerHTML = `<div class="ok">✅ 인식됨 — 매출 ${parsed.sales.length} · 매입 ${parsed.purchases.length} · 입출금 ${parsed.transactions.length} · 송금처 ${parsed.vendors.length}건</div>`;
        q("#ie-apply").disabled = false;
      } catch (err) {
        q("#ie-preview").innerHTML = `<div class="err">❌ 읽기 실패: ${E(err.message)}</div>`;
      }
    };
    q("#ie-cancel").onclick = close;
    q("#ie-apply").onclick = () => {
      if (!parsed) return;
      S.addSales(parsed.sales); S.addPurchases(parsed.purchases); S.addTransactions(parsed.transactions);
      parsed.vendors.forEach((v) => S.upsertVendor(v)); S.save();
      close(); App.go("dashboard");
    };
  }

  /* ===== 2) 기업은행 통장내역 자동 분류 ===== */
  function importBank() {
    open("🏦 기업은행 통장내역 자동 정리",
      `<p>기업은행에서 받은 <b>거래내역 엑셀</b>을 올리면 입금/출금을 자동으로 구분하고 분류합니다.
         입금은 <b>매출 정산</b>, 출금은 <b>매입·비용</b>으로 분류됩니다.</p>
       <div class="form-row"><label>스토어</label>${storeSelect("bk-store")}</div>
       <div class="form-row"><label>거래내역 파일</label><input type="file" id="bk-file" accept=".xlsx,.xls"></div>
       <div id="bk-preview" class="preview"></div>`,
      `<button class="btn" id="bk-cancel">취소</button>
       <button class="btn primary" id="bk-apply" disabled>입출금 내역에 추가</button>`);
    let result = null;
    q("#bk-file").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        result = await Parsers.parseBankStatement(f, q("#bk-store").value);
        renderBankPreview(result);
        q("#bk-apply").disabled = result.txns.length === 0;
      } catch (err) {
        q("#bk-preview").innerHTML = `<div class="err">❌ 읽기 실패: ${E(err.message)}<br>형식이 예상과 다를 수 있어요. 헤더에 '거래일자/입금/출금' 같은 항목이 있는지 확인해주세요.</div>`;
      }
    };
    q("#bk-cancel").onclick = close;
    q("#bk-apply").onclick = () => {
      if (!result) return;
      // 미리보기에서 수정된 분류 반영 + 사용자가 정한 분류를 기억(학습)
      result.txns.forEach((t, i) => {
        const sel = q(`#bk-cat-${i}`); if (sel) t.category = sel.value;
        S.learnRule(t.counterparty || t.desc, t.type, t.category, t.channel);
      });
      S.addTransactions(result.txns);
      close(); App.go("transactions");
    };
  }

  function renderBankPreview(result) {
    const detected = Object.entries(Parsers.COLMAP)
      .filter(([f]) => result.mapping[f] != null)
      .map(([f]) => f).join(", ");
    const inCnt = result.txns.filter((t) => t.type === "in").length;
    const outCnt = result.txns.length - inCnt;
    const inSum = result.txns.filter((t) => t.type === "in").reduce((a, t) => a + t.amount, 0);
    const outSum = result.txns.filter((t) => t.type === "out").reduce((a, t) => a + t.amount, 0);
    const cats = S.CATEGORIES.concat(["매출정산"]);
    q("#bk-preview").innerHTML = `
      <div class="ok">✅ ${result.txns.length}건 인식 — 입금 ${inCnt}건(₩${won(inSum)}) · 출금 ${outCnt}건(₩${won(outSum)})</div>
      <div class="hint">인식된 열: ${detected || "없음"} — 아래에서 분류를 수정할 수 있어요.</div>
      <div class="table-wrap scroll"><table class="grid">
        <thead><tr><th>일자</th><th>구분</th><th>내용/거래처</th><th class="num">금액</th><th>분류</th></tr></thead>
        <tbody>${result.txns.map((t, i) => `<tr>
          <td>${t.month || ""}.${t.day || ""}</td>
          <td><span class="tag ${t.type}">${t.type === "in" ? "입금" : "출금"}</span></td>
          <td>${E(t.desc || t.counterparty)}</td>
          <td class="num">₩${won(t.amount)}</td>
          <td><select id="bk-cat-${i}" class="mini">${cats.map((c) =>
            `<option ${c === t.category ? "selected" : ""}>${c}</option>`).join("")}</select></td>
        </tr>`).join("")}</tbody>
      </table></div>`;
  }

  /* ===== 3) 발주서 → 매입 (열 매핑형) ===== */
  const PO_FIELDS = [
    ["date", "일자"], ["vendor", "업체명"], ["desc", "품목/내용"],
    ["qty", "수량"], ["supply", "공급가"], ["vat", "세액"], ["total", "합계/금액"],
    ["store", "스토어(있으면)"], ["orders", "건수(있으면)"],
  ];
  function importPO() {
    open("🧾 발주서로 매입 정리",
      `<p>발주서 엑셀을 올리면 열 목록을 보여드립니다. 각 항목이 <b>어느 열</b>인지 골라주세요. (양식이 달라도 됩니다)</p>
       <div class="form-row"><label>스토어</label>${storeSelect("po-store")}</div>
       <div class="form-row two">
         <span><label>증빙</label><select id="po-ev">${S.EVIDENCES.map((x) => `<option>${x}</option>`).join("")}</select></span>
         <span><label>분류</label><select id="po-cat">${S.CATEGORIES.map((x) => `<option ${x === "상품매입" ? "selected" : ""}>${x}</option>`).join("")}</select></span>
       </div>
       <div class="form-row two">
         <span><label>기본 업체명(열에 없을 때)</label><input id="po-vendor" placeholder="예: ㈜푸드엔드베스트"></span>
         <span><label>기본 연/월</label><input id="po-ym" placeholder="예: 2026-4" style="width:100%"></span>
       </div>
       <div class="form-row"><label>발주서 파일</label><input type="file" id="po-file" accept=".xlsx,.xls,.csv"></div>
       <div id="po-map"></div>
       <div id="po-preview" class="preview"></div>`,
      `<button class="btn" id="po-cancel">취소</button>
       <button class="btn primary" id="po-apply" disabled>매입에 추가</button>`);
    let table = null;
    q("#po-file").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        table = await Parsers.readGenericTable(f);
        renderPOMapping(table);
      } catch (err) {
        q("#po-preview").innerHTML = `<div class="err">❌ 읽기 실패: ${E(err.message)}</div>`;
      }
    };
    q("#po-cancel").onclick = close;
    q("#po-apply").onclick = () => {
      if (!table) return;
      const mapping = {};
      PO_FIELDS.forEach(([f]) => {
        const v = q(`#po-f-${f}`).value;
        if (v !== "") mapping[f] = +v;
      });
      const ym = (q("#po-ym").value || "").match(/(\d{4})\D+(\d{1,2})/);
      const fixed = {
        store: q("#po-store").value, evidence: q("#po-ev").value, category: q("#po-cat").value,
        vendor: q("#po-vendor").value.trim(),
        taxType: q("#po-store").value === "yb" ? "과세" : "면세",
        year: ym ? +ym[1] : new Date().getFullYear(), month: ym ? +ym[2] : "",
      };
      const rows = Parsers.applyPurchaseMapping(table.body, mapping, fixed);
      S.addPurchases(rows);
      close(); App.go("purchases");
    };
  }

  function renderPOMapping(table) {
    const opts = (sel) => `<option value="">(없음)</option>` +
      table.headers.map((h) => `<option value="${h.index}" ${guess(sel, h.name) ? "selected" : ""}>${E(h.name)}</option>`).join("");
    q("#po-map").innerHTML = `<div class="map-grid">${PO_FIELDS.map(([f, label]) =>
      `<span><label>${label}</label><select id="po-f-${f}">${opts(f)}</select></span>`).join("")}</div>`;
    // 미리보기
    const preview = table.body.slice(0, 5);
    q("#po-preview").innerHTML = `<div class="ok">✅ ${table.body.length}행 · 열 ${table.headers.length}개 인식</div>
      <div class="table-wrap scroll"><table class="grid"><thead><tr>${table.headers.map((h) => `<th>${E(h.name)}</th>`).join("")}</tr></thead>
      <tbody>${preview.map((r) => `<tr>${table.headers.map((h) => `<td>${E(r[h.index])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    PO_FIELDS.forEach(() => {}); // noop
    host.querySelectorAll(".map-grid select").forEach((s) => s.onchange = () => { q("#po-apply").disabled = false; });
    q("#po-apply").disabled = false;
  }

  // 헤더 이름으로 필드 자동 추측
  function guess(field, name) {
    const n = String(name).replace(/\s/g, "");
    const k = {
      date: ["일자", "날짜", "발주일", "주문일", "date"],
      vendor: ["거래처", "업체", "공급처", "공급업체", "vendor", "상호", "거래선", "마켓", "채널", "쇼핑몰"],
      desc: ["품목", "상품", "내용", "내역", "품명", "옵션명", "옵션", "상품명", "item"],
      qty: ["수량", "qty", "개수"],
      supply: ["공급가", "단가", "공급"],
      vat: ["세액", "부가", "vat", "세금"],
      total: ["합계", "금액", "총액", "amount", "total", "공급대가"],
      store: ["스토어", "store", "매장"],
      orders: ["건수", "주문수", "주문건"],
    }[field] || [];
    return k.some((x) => n.toLowerCase().includes(x.toLowerCase()));
  }

  /* ===== 4) 행 수정 (매입/매출/입출금) ===== */
  const EDIT_FIELDS = {
    purchases: [
      { k: "year", l: "년", t: "num" }, { k: "month", l: "월", t: "num" }, { k: "day", l: "일", t: "num" },
      { k: "evidence", l: "증빙", t: "sel", opts: () => S.EVIDENCES },
      { k: "category", l: "분류", t: "sel", opts: () => S.CATEGORIES },
      { k: "desc", l: "내용", t: "text", wide: true },
      { k: "vendor", l: "업체명", t: "text", wide: true },
      { k: "supply", l: "공급가", t: "num" }, { k: "vat", l: "세액", t: "num" }, { k: "total", l: "합계", t: "num" },
      { k: "orders", l: "주문건수", t: "num" }, { k: "paid", l: "결제여부", t: "text" },
    ],
    sales: [
      { k: "year", l: "년", t: "num" }, { k: "month", l: "월", t: "num" },
      { k: "channel", l: "채널", t: "sel", opts: () => S.CHANNELS, free: true },
      { k: "taxClass", l: "구분", t: "sel", opts: () => ["면세", "과세"] },
      { k: "desc", l: "내용", t: "text", wide: true },
      { k: "orders", l: "주문건수", t: "num" },
      { k: "supply", l: "공급가액", t: "num" }, { k: "vat", l: "세액", t: "num" }, { k: "total", l: "합계", t: "num" },
      { k: "settled", l: "정산여부", t: "text" },
    ],
    transactions: [
      { k: "year", l: "년", t: "num" }, { k: "month", l: "월", t: "num" }, { k: "day", l: "일", t: "num" },
      { k: "store", l: "사업장", t: "sel", opts: () => [["", "공통"], ["groven", "그로븐"], ["yb", "YB"]] },
      { k: "type", l: "입출구분", t: "sel", opts: () => [["in", "입금"], ["out", "출금"]] },
      { k: "category", l: "분류", t: "sel", opts: () => S.CATEGORIES.concat(["매출정산"]) },
      { k: "desc", l: "내용", t: "text", wide: true },
      { k: "counterparty", l: "거래처", t: "text", wide: true },
      { k: "amount", l: "금액", t: "num" },
      { k: "bank", l: "은행", t: "text" }, { k: "account", l: "계좌번호", t: "text" },
      { k: "note", l: "비고", t: "text", wide: true },
    ],
    deposits: [
      { k: "store", l: "사업장", t: "sel", opts: () => [["", "공통"], ["groven", "그로븐"], ["yb", "YB"]] },
      { k: "vendor", l: "거래처", t: "text" },
      { k: "date", l: "날짜", t: "date" },
      { k: "kind", l: "구분", t: "sel", opts: () => ["충전", "사용"] },
      { k: "amount", l: "금액", t: "num" },
      { k: "memo", l: "메모", t: "text", wide: true },
    ],
    fixedCosts: [
      { k: "store", l: "사업장", t: "sel", opts: () => [["groven", "그로븐"], ["yb", "YB"]] },
      { k: "vendor", l: "공급처", t: "text" },
      { k: "note", l: "내용", t: "text", wide: true },
      { k: "count", l: "건수", t: "num" },
      { k: "amount", l: "금액", t: "num" },
    ],
    adspend: [
      { k: "date", l: "날짜", t: "date" },
      { k: "store", l: "사업장", t: "sel", opts: () => [["groven", "그로븐"], ["yb", "YB"]] },
      { k: "platform", l: "플랫폼", t: "text" },
      { k: "amount", l: "소진액", t: "num" },
      { k: "memo", l: "메모", t: "text", wide: true },
    ],
    settlements: [
      { k: "store", l: "사업장", t: "sel", opts: () => [["groven", "그로븐"], ["yb", "YB"]] },
      { k: "vendor", l: "거래처", t: "text" },
      { k: "date", l: "발주일", t: "text" },
      { k: "recipient", l: "받는분", t: "text" },
      { k: "addr", l: "주소", t: "text", wide: true },
      { k: "item", l: "품목", t: "text", wide: true },
      { k: "qty", l: "수량", t: "num" },
      { k: "supply", l: "공급가", t: "num" },
      { k: "ship", l: "배송비", t: "num" },
      { k: "total", l: "합계", t: "num" },
      { k: "note", l: "비고(C/S 등)", t: "text", wide: true },
    ],
    cs: [
      { k: "date", l: "일자", t: "date" },
      { k: "store", l: "사업장", t: "sel", opts: () => [["groven", "그로븐"], ["yb", "YB"]] },
      { k: "channel", l: "채널", t: "text" },
      { k: "recipient", l: "주문자(받는분)", t: "text" },
      { k: "orderNo", l: "주문번호", t: "text" },
      { k: "type", l: "유형", t: "sel", opts: () => ["반품", "교환", "환불", "오배송", "파손", "단순문의", "기타"] },
      { k: "item", l: "상품·내용", t: "text", wide: true },
      { k: "status", l: "상태", t: "sel", opts: () => ["접수", "처리중", "완료"] },
      { k: "note", l: "처리내용", t: "text", wide: true },
    ],
  };
  const KIND_LABEL = { purchases: "매입", sales: "매출", transactions: "입출금", deposits: "예치금", fixedCosts: "고정비", cs: "C/S", adspend: "광고비", settlements: "정산서" };

  function editRow(kind, id) {
    const row = (S.data[kind] || []).find((r) => r.id === id);
    if (!row) return;
    const fields = EDIT_FIELDS[kind];
    const fieldHtml = fields.map((f) => {
      const v = row[f.k] != null ? row[f.k] : "";
      let input;
      if (f.t === "sel") {
        const opts = f.opts();
        const optionTags = opts.map((o) => {
          const val = Array.isArray(o) ? o[0] : o;
          const lab = Array.isArray(o) ? o[1] : o;
          return `<option value="${E(val)}" ${String(v) === String(val) ? "selected" : ""}>${E(lab)}</option>`;
        }).join("");
        // free=true 인 경우 목록에 없는 기존값도 유지
        const extra = (f.free && v && !opts.some((o) => String(Array.isArray(o) ? o[0] : o) === String(v)))
          ? `<option value="${E(v)}" selected>${E(v)}</option>` : "";
        input = `<select id="ed-${f.k}">${extra}${optionTags}</select>`;
      } else {
        input = `<input id="ed-${f.k}" type="${f.t === "num" ? "number" : f.t === "date" ? "date" : "text"}" value="${E(v)}">`;
      }
      return `<span class="${f.wide ? "wide" : ""}"><label>${f.l}</label>${input}</span>`;
    }).join("");

    open(`${KIND_LABEL[kind]} 내용 수정`,
      `<div class="edit-grid">${fieldHtml}</div>
       <p class="hint">금액을 바꾸면 표·차트·보고서에 바로 반영됩니다.</p>`,
      `<button class="btn" id="ed-cancel">취소</button>
       <button class="btn primary" id="ed-save">저장</button>`);
    q("#ed-cancel").onclick = close;
    q("#ed-save").onclick = () => {
      const patch = {};
      fields.forEach((f) => {
        const el = q(`#ed-${f.k}`); if (!el) return;
        patch[f.k] = f.t === "num" ? S.num(el.value) : el.value;
      });
      S.update(kind, id, patch);
      close();
    };
  }

  /* ===== 5) 매입 직접 추가 (붙여넣기) ===== */
  function importPaste() {
    open("📋 매입 직접 추가 (붙여넣기)",
      `<p>한 줄에 하나씩 붙여넣으세요. 형식: <b>거래처, 스토어, 금액, 건수</b><br>
        스토어는 <b>그로븐</b> 또는 <b>YB</b>(=옐로우브릿지). 건수는 없으면 비워도 돼요.</p>
       <div class="form-row two">
         <span><label>기본 연/월</label><input id="ps-ym" placeholder="예: 2026-5"></span>
         <span><label>분류</label><select id="ps-cat">${S.CATEGORIES.map((x) => `<option ${x === "상품매입" ? "selected" : ""}>${x}</option>`).join("")}</select></span>
       </div>
       <div class="form-row"><label>매입 줄 (거래처, 스토어, 금액, 건수)</label>
         <textarea id="ps-text" rows="12" style="width:100%;font-family:monospace;font-size:12.5px" placeholder="공덕농협, YB, 36000, 2&#10;생선상륙, 그로븐, 36500, 3"></textarea></div>
       <div id="ps-preview" class="preview"></div>`,
      `<button class="btn" id="ps-cancel">취소</button>
       <button class="btn primary" id="ps-apply">매입에 추가</button>`);

    const normStore = (v) => {
      v = String(v || "").toLowerCase().trim();
      if (v.indexOf("yb") !== -1 || v.indexOf("옐") !== -1 || v.indexOf("과세") !== -1) return "yb";
      return "groven";
    };
    q("#ps-cancel").onclick = close;
    q("#ps-apply").onclick = () => {
      const ymM = (q("#ps-ym").value || "").match(/(\d{4})\D+(\d{1,2})/);
      const year = ymM ? +ymM[1] : new Date().getFullYear();
      const month = ymM ? +ymM[2] : "";
      const cat = q("#ps-cat").value;
      const lines = q("#ps-text").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const rows = [];
      lines.forEach((line) => {
        const p = line.split(/[,\t]/).map((x) => x.trim());
        if (p.length < 3) return;
        const vendor = p[0];
        const store = normStore(p[1]);
        const amount = Parsers.num(p[2]);
        const count = p[3] ? Parsers.num(p[3]) : 1;
        if (!vendor || !amount) return;
        rows.push({
          store, year, month, day: "", evidence: store === "yb" ? "세금계산서" : "계산서",
          category: cat, desc: vendor, vendor, supply: amount, vat: 0, total: amount,
          orders: count, paid: "", note: "직접추가",
        });
      });
      if (!rows.length) { q("#ps-preview").innerHTML = `<div class="err">읽을 줄이 없어요. 형식을 확인해주세요.</div>`; return; }
      S.addPurchases(rows);
      close(); App.go("purchases");
    };
  }

  /* ===== 6) 홈택스 증빙 대조 ===== */
  function importEvidence() {
    open("🧾 홈택스 증빙 대조 (매입 금액 체크)",
      `<p>홈택스에서 받은 <b>현금영수증 · 계산서 · 세금계산서</b> 파일을 올리면, 장부 매입과 자동 대조해요. (여러 개 한 번에 선택 가능)</p>
       <div class="form-row"><label>대상 연/월</label><input id="ev-ym" placeholder="예: 2026-5" style="min-width:140px"></div>
       <div class="form-row"><label>홈택스 파일 (.xls / .xlsx)</label><input type="file" id="ev-file" accept=".xls,.xlsx" multiple></div>
       <div id="ev-result" class="preview"></div>`,
      `<button class="btn" id="ev-cancel">닫기</button>`);
    q("#ev-cancel").onclick = close;
    q("#ev-file").onchange = async (e) => {
      const files = [...e.target.files]; if (!files.length) return;
      q("#ev-result").innerHTML = `<div class="ok">읽는 중…</div>`;
      const parsed = [];
      for (const f of files) {
        try { parsed.push(await Parsers.parseHometaxEvidence(f)); }
        catch (err) { parsed.push({ type: "", store: "", supply: 0, vat: 0, total: 0, fileName: f.name, err: err.message }); }
      }
      renderEvidenceCompare(parsed);
    };
  }

  function renderEvidenceCompare(parsed) {
    const ymM = (q("#ev-ym").value || "").match(/(\d{4})\D+(\d{1,2})/);
    const year = ymM ? +ymM[1] : "";
    const month = ymM ? +ymM[2] : "";
    const storeNm = (s) => s === "yb" ? "YB" : (s === "groven" ? "그로븐" : "통합");
    // 거래처별 집계 (대표이름으로 묶음)
    const agg = {};
    parsed.forEach((p) => (p.byVendor || []).forEach((v) => {
      const cv = S.canonVendor(v.vendor);
      const k = cv + "|" + p.type + "|" + (p.store || "");
      agg[k] = agg[k] || { vendor: cv, type: p.type, store: p.store, ht: 0 };
      agg[k].ht += v.supply || v.total;
    }));
    const rows = Object.values(agg).map((a) => {
      const book = S.filterBy(S.data.purchases, { store: a.store, year, month })
        .filter((r) => S.canonVendor(r.vendor) === a.vendor)
        .reduce((acc, r) => acc + S.num(r.supply || r.total), 0);
      return Object.assign(a, { book, diff: a.ht - book });
    }).sort((x, y) => y.ht - x.ht);
    const htSum = rows.reduce((a, r) => a + r.ht, 0);

    let savedMsg = "";
    if (year && month) {
      S.data.evidence[year + "-" + month] = rows.map((r) => ({ vendor: r.vendor, type: r.type, store: r.store, ht: r.ht }));
      S.save();
      savedMsg = ` · 💾 저장됨 (보고서에 표시돼요)`;
    } else { savedMsg = ` · ⚠️ 저장하려면 연/월을 입력하세요`; }

    q("#ev-result").innerHTML = `
      <div class="ok">✅ ${parsed.length}개 파일 · 거래처 ${rows.length}곳 · 홈택스 발행 합계 ₩${won(htSum)}${savedMsg}</div>
      <div class="hint">거래처별로 <b>홈택스 발행액(공급가)</b> 과 <b>장부 매입(공급가)</b> 을 대조해요. 차액 0이면 일치 ✅</div>
      <div class="table-wrap scroll"><table class="grid">
        <thead><tr><th>거래처</th><th>증빙</th><th>스토어</th><th class="num">홈택스</th><th class="num">장부</th><th class="num">차액</th><th>판정</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td>${E(r.vendor)}</td><td>${E(r.type)}</td><td>${storeNm(r.store)}</td>
          <td class="num">₩${won(r.ht)}</td><td class="num">₩${won(r.book)}</td>
          <td class="num" style="color:${r.diff === 0 ? "#0a8043" : "#dc2626"}">${r.diff > 0 ? "+" : ""}${won(r.diff)}</td>
          <td>${r.diff === 0 ? "✅" : "🔴"}</td></tr>`).join("")}
        </tbody></table></div>
      <p class="hint">※ 세금계산서의 쿠팡·네이버·지마켓·당근 등은 플랫폼 수수료라 장부 상품매입엔 없을 수 있어요(차액 정상).</p>`;
  }

  /* ===== 7) 발주서 → 발주내역 ===== */
  const OD_FIELDS = [["date", "일자"], ["vendor", "거래처(매입처)"], ["desc", "품목명"], ["qty", "수량"]];
  function importOrders() {
    open("📦 발주서 올리기 (발주내역)",
      `<p>발주서 엑셀을 올리면 <b>발주내역</b>으로 등록돼요. 여러 개 <b>한꺼번에 선택</b>해도 됩니다 (같은 양식일 때).<br>
        <span class="muted" style="font-size:12px">스토어는 <b>파일명</b>의 '그로븐'/'옐로우브릿지'로 파일마다 자동 구분돼요. 열 매칭은 첫 파일 기준으로 모든 파일에 적용돼요.</span></p>
       <div class="form-row two">
         <span><label>스토어 <span class="muted" id="od-store-auto" style="font-size:11px">(파일명으로 자동)</span></label>${storeSelect("od-store")}</span>
         <span><label>기본 연/월 <span class="muted" style="font-size:11px">(날짜 없을 때)</span></label><div>${ymSelect("od-year", "od-month")}</div></span>
       </div>
       <div class="form-row"><label>기본 거래처(열에 없을 때)</label><input id="od-vendor" placeholder="예: 일비"></div>
       <div class="form-row"><label>발주서 파일 (여러 개 가능)</label><input type="file" id="od-file" accept=".xlsx,.xls,.csv" multiple></div>
       <div id="od-map"></div><div id="od-prev" class="preview"></div>`,
      `<button class="btn" id="od-cancel">취소</button><button class="btn primary" id="od-apply" disabled>발주내역에 추가</button>`);
    let files = [];
    const stLbl = (s) => s === "yb" ? "옐로우브릿지" : s === "groven" ? "그로븐" : "미지정(수동)";
    q("#od-file").onchange = async (e) => {
      files = [];
      const fl = [...e.target.files]; if (!fl.length) return;
      q("#od-prev").innerHTML = `<div class="muted">읽는 중…</div>`;
      for (const f of fl) {
        const detected = /옐로우|옐브|yb|과세/i.test(f.name) ? "yb" : (/그로븐|grov|면세/i.test(f.name) ? "groven" : "");
        try { const t = await Parsers.readGenericTable(f); files.push({ table: t, store: detected, name: f.name }); }
        catch (err) { /* 읽기 실패 파일은 건너뜀 */ }
      }
      if (!files.length) { q("#od-prev").innerHTML = `<div class="err">읽을 수 있는 파일이 없어요.</div>`; return; }
      renderODMap(files[0].table); // 첫 파일 기준 열 매칭
      q("#od-prev").innerHTML = `<div class="ok">✅ ${files.length}개 파일 인식<br>${files.map((x) => `· ${E(x.name)} → <b>${stLbl(x.store)}</b>`).join("<br>")}</div>`;
      q("#od-apply").disabled = false;
    };
    q("#od-cancel").onclick = close;
    q("#od-apply").onclick = () => {
      if (!files.length) return;
      const map = {}; OD_FIELDS.forEach(([f]) => { const v = q(`#od-f-${f}`).value; if (v !== "") map[f] = +v; });
      const fallbackStore = q("#od-store").value, baseV = q("#od-vendor").value.trim();
      const yr = +q("#od-year").value, mo = +q("#od-month").value;
      lastYM = { y: yr, m: mo };
      const out = [];
      files.forEach(({ table, store, name }) => {
        const st = store || fallbackStore;
        const fd = String(name).match(/(\d{2})(\d{2})(\d{2})/); // 파일명 YYMMDD
        const fYr = fd ? 2000 + +fd[1] : null, fMo = fd ? +fd[2] : null, fDy = fd ? +fd[3] : null;
        const fVen = fileVendor(name);
        const hRcv = table.headers.find((h) => /수령인|받는분|수령자|수취인/.test(String(h.name).replace(/\s/g, "")));
        table.body.forEach((r) => {
          const get = (f) => map[f] != null ? r[map[f]] : null;
          const desc = Parsers.str(get("desc"));
          const vendor = Parsers.str(get("vendor")) || baseV || fVen;
          const qty = Parsers.num(get("qty"));
          if (!desc && !vendor) return;
          const d = Parsers.parseDate(get("date"));
          out.push({ store: st, year: d.y || fYr || yr, month: d.m || fMo || mo, day: d.d || fDy || "",
            vendor, desc, qty, recipient: hRcv ? Parsers.str(r[hRcv.index]) : "", note: "발주서" });
        });
      });
      if (!out.length) { q("#od-prev").innerHTML = `<div class="err">읽을 행이 없어요.</div>`; return; }
      // 중복 제거 (같은 파일 재업로드해도 안 쌓이게)
      const sig = (o) => `${o.store || ""}|${o.year}|${o.month}|${o.day}|${o.vendor}|${o.desc}|${o.recipient || ""}`;
      const seen = new Set((S.data.orders || []).map(sig));
      const fresh = []; let skipped = 0;
      out.forEach((o) => { const k = sig(o); if (seen.has(k)) { skipped++; } else { seen.add(k); fresh.push(o); } });
      if (!fresh.length) { q("#od-prev").innerHTML = `<div class="err">모두 이미 등록된 발주예요 (중복 ${skipped}건).</div>`; return; }
      S.addOrders(fresh);
      if (App.scope) { App.scope.year = fresh[0].year; App.scope.month = fresh[0].month; }
      close(); App.go("orders");
      if (skipped) alert(`${fresh.length}건 추가, 중복 ${skipped}건은 건너뛰었어요.`);
    };
  }
  function renderODMap(table) {
    const opts = (sel) => `<option value="">(없음)</option>` +
      table.headers.map((h) => `<option value="${h.index}" ${guess(sel, h.name) ? "selected" : ""}>${E(h.name)}</option>`).join("");
    q("#od-map").innerHTML = `<div class="map-grid">${OD_FIELDS.map(([f, l]) =>
      `<span><label>${l}</label><select id="od-f-${f}">${opts(f)}</select></span>`).join("")}</div>`;
    q("#od-prev").innerHTML = `<div class="ok">✅ ${table.body.length}행 인식 — 열을 <b>자동으로 맞췄어요</b>. 그대로 <b>'발주내역에 추가'</b> 누르면 돼요. (이상하면 위 칸에서 바꾸세요)</div>`;
    q("#od-apply").disabled = false;
  }

  /* ===== 8) 예치금 충전현황 파일 올리기 ===== */
  function importDeposits() {
    open("💳 예치금 이력 올리기",
      `<p>예치금 충전·사용 이력 엑셀을 올려요. (열: 발생일·내용·카드/현금변동 또는 적립·차감) 어느 거래처·사업장인지 골라주세요.</p>
       <div class="form-row two">
         <span><label>사업장(스토어)</label>${storeSelect("de-store")}</span>
         <span><label>거래처</label><input id="de-vendor" placeholder="예: 도매꾹 이머니 충전" style="width:100%"></span>
       </div>
       <div class="form-row"><label>예치금 이력 파일</label><input type="file" id="de-file" accept=".xlsx,.xls,.csv"></div>
       <div class="form-row"><label>당일(시각만 표시된) 거래의 날짜 <span class="muted" style="font-weight:400">— 도매꾹은 오늘 거래에 날짜 대신 시각만 나와요</span></label>
         <input type="date" id="de-today" value="${ymd(new Date())}" style="min-width:180px"></div>
       <div id="de-prev" class="preview"></div>`,
      `<button class="btn" id="de-cancel">취소</button><button class="btn primary" id="de-apply" disabled>예치금에 추가</button>`);
    let table = null;
    q("#de-file").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        table = await Parsers.readGenericTable(f);
        // 시각만 있는(날짜 없는) 행 개수 세기 → 보고서 발행일로 보정 안내
        const iDateP = table.headers.findIndex((h) => /발생일|일시|날짜/.test(String(h.name).replace(/\s/g, "")));
        let timeOnly = 0;
        if (iDateP >= 0) table.body.forEach((r) => { const d = fmtDateTime(r[iDateP]); if (!d.date && d.time) timeOnly++; });
        if (table.wbDate) q("#de-today").value = ymd(new Date(table.wbDate));
        const note = timeOnly ? ` · 날짜 없이 시각만 있는 ${timeOnly}건은 위 '당일 날짜'(${q("#de-today").value})로 처리돼요` : "";
        q("#de-prev").innerHTML = `<div class="ok">✅ ${table.body.length}행 인식 — 충전/사용 자동 구분${note}</div>`;
        q("#de-apply").disabled = false;
      } catch (err) { q("#de-prev").innerHTML = `<div class="err">❌ ${E(err.message)}</div>`; }
    };
    q("#de-cancel").onclick = close;
    q("#de-apply").onclick = () => {
      if (!table) return;
      const store = q("#de-store").value, vendor = q("#de-vendor").value.trim() || "예치금";
      const todayStr = q("#de-today").value || ymd(new Date());
      const H = table.headers;
      const nm = (h) => String(h.name).replace(/\s/g, "");
      const find = (pred) => { const h = H.find(pred); return h ? h.index : -1; };
      const iDate = find((h) => /발생일|일시|날짜/.test(nm(h)));
      const iMemo = find((h) => /내용|내역|적요/.test(nm(h)));
      const iCash = find((h) => nm(h) === "현금변동");
      const iCard = find((h) => nm(h) === "카드변동");
      const iVar = find((h) => nm(h) === "변동" || /변동액|변동금액/.test(nm(h)));
      const iUp = find((h) => nm(h) === "적립" || nm(h) === "충전" || nm(h) === "적립금" || nm(h) === "적립금액" || nm(h) === "입금");
      const iDown = find((h) => nm(h) === "차감" || nm(h) === "사용" || nm(h) === "차감금액" || nm(h) === "출금");
      // 잔액(총잔액 우선 → 현금잔액 → 잔액/잔여) — 중복이 있어도 실제 잔액 표시용
      const iBal = find((h) => nm(h) === "총잔액") >= 0 ? find((h) => nm(h) === "총잔액")
        : find((h) => nm(h) === "현금잔액") >= 0 ? find((h) => nm(h) === "현금잔액")
        : find((h) => /잔액|잔여|적립금잔액/.test(nm(h)));
      // 번호(순서) — 같은 시각이어도 어느 게 최신인지 구분 (잔액 정확히)
      const iSeq = find((h) => nm(h) === "번호" || nm(h) === "No" || nm(h) === "순번" || nm(h) === "거래번호");
      const out = [];
      table.body.forEach((r) => {
        const dt = fmtDateTime(iDate >= 0 ? r[iDate] : "");
        const date = dt.date || todayStr;            // 시각만 있으면 당일 날짜로
        const at = dt.time ? `${date} ${dt.time}` : date;
        const memo = iMemo >= 0 ? Parsers.str(r[iMemo]) : "";
        const bal = iBal >= 0 ? Parsers.num(r[iBal]) : null;
        const seq = iSeq >= 0 ? Parsers.num(r[iSeq]) : null;
        let change = 0, up = 0, down = 0;
        if (iCash >= 0 || iCard >= 0) change = (iCash >= 0 ? Parsers.num(r[iCash]) : 0) + (iCard >= 0 ? Parsers.num(r[iCard]) : 0);
        else if (iVar >= 0) change = Parsers.num(r[iVar]);
        else { up = Parsers.num(iUp >= 0 ? r[iUp] : 0); down = Math.abs(Parsers.num(iDown >= 0 ? r[iDown] : 0)); }
        if (change > 0 || up > 0) out.push({ store, vendor, date, at, kind: "충전", amount: change > 0 ? change : up, memo, bal, seq });
        else if (change < 0 || down > 0) out.push({ store, vendor, date, at, kind: "사용", amount: change < 0 ? Math.abs(change) : down, memo, bal, seq });
      });
      if (!out.length) { q("#de-prev").innerHTML = `<div class="err">금액 열(적립/차감 또는 현금변동·카드변동)을 못 읽었어요.</div>`; return; }
      const { added, skipped } = addDepositsDedup(out);
      S.save(); close(); App.go("deposits");
      if (skipped) alert(`${added}건 추가, 중복 ${skipped}건은 건너뛰었어요.`);
    };
  }

  // 셀(Date 객체·문자열·엑셀 일련번호) → { date:"YYYY-MM-DD" 또는 "", time:"HH:MM:SS" 또는 "" }
  // 날짜 없이 시각만 있는 경우(도매꾹 당일거래)는 date:"" 로 두고 호출부에서 보정
  function fmtDateTime(v) {
    const p2 = (n) => String(n).padStart(2, "0");
    if (v instanceof Date && !isNaN(v)) {
      const date = v.getFullYear() <= 1900 ? "" : `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}`;
      const hasT = v.getHours() || v.getMinutes() || v.getSeconds();
      return { date, time: hasT ? `${p2(v.getHours())}:${p2(v.getMinutes())}:${p2(v.getSeconds())}` : "" };
    }
    if (typeof v === "number" && v > 20000 && v < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000));
      return { date: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`, time: "" };
    }
    const s = String(v == null ? "" : v).trim();
    let dm = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/), yr, mo, dy;
    if (dm) { yr = +dm[1]; mo = +dm[2]; dy = +dm[3]; }
    else { dm = s.match(/(\d{2})[-./](\d{1,2})[-./](\d{1,2})/); if (dm) { yr = 2000 + +dm[1]; mo = +dm[2]; dy = +dm[3]; } }
    const date = yr ? `${yr}-${p2(mo)}-${p2(dy)}` : "";
    const tm = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    const time = tm ? `${p2(tm[1])}:${tm[2]}:${tm[3] || "00"}` : "";
    return { date, time };
  }
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // 중복 건너뛰고 추가. 같은 파일 재업로드만 거르고, 같은 날 반복거래는 살림
  // (발생일시 전체 + 금액 + 구분 기준. 한 배치 안의 동일키는 순번으로 구분해 모두 추가)
  function addDepositsDedup(rows) {
    if (!S.data.deposits) S.data.deposits = [];
    const baseSig = (d) => `${d.store || ""}|${d.vendor}|${(d.at || d.date || "").trim()}|${d.kind}|${S.num(d.amount)}|${(d.memo || "").trim()}`;
    // 기존 저장분의 시그니처별 개수
    const existing = {};
    S.data.deposits.forEach((d) => { const k = baseSig(d); existing[k] = (existing[k] || 0) + 1; });
    const batchCount = {};
    let added = 0, skipped = 0;
    rows.forEach((d) => {
      const k = baseSig(d);
      const idx = (batchCount[k] = (batchCount[k] || 0) + 1); // 이 배치에서 몇 번째 동일건인지
      if ((existing[k] || 0) >= idx) { skipped++; return; } // 기존에 이미 그 개수만큼 있으면 중복
      S.data.deposits.push(Object.assign({ id: S.uid() }, d));
      added++;
    });
    return { added, skipped };
  }

  /* ===== 9) 예치금/적립금 붙여넣기 (엑셀 다운 안 될 때) ===== */
  function importDepositPaste() {
    open("📋 예치금/적립금 붙여넣기",
      `<p>다운로드가 안 되는 적립금 화면은, <b>표를 마우스로 긁어 복사 → 여기 붙여넣기</b> 하면 돼요.<br>
        날짜·적립·사용 금액을 자동으로 찾아 등록해요.</p>
       <div class="form-row two">
         <span><label>사업장</label>${storeSelect("dpp-store")}</span>
         <span><label>거래처</label><input id="dpp-vendor" placeholder="예: 11번가 적립금" style="width:100%"></span>
       </div>
       <div class="form-row"><label>표 붙여넣기</label>
         <textarea id="dpp-text" rows="10" style="width:100%;font-family:monospace;font-size:12px" placeholder="15  2026-06-08 09:21:51  주문결제  0  -7,700  44,000"></textarea></div>
       <div id="dpp-prev" class="preview"></div>`,
      `<button class="btn" id="dpp-cancel">취소</button><button class="btn primary" id="dpp-apply">예치금에 추가</button>`);
    q("#dpp-cancel").onclick = close;
    q("#dpp-apply").onclick = () => {
      const store = q("#dpp-store").value, vendor = q("#dpp-vendor").value.trim() || "적립금";
      const lines = q("#dpp-text").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const out = [];
      lines.forEach((line) => {
        const dm = line.match(/\d{4}[-./]\d{1,2}[-./]\d{1,2}(\s+\d{1,2}:\d{2}(:\d{2})?)?/);
        const dt = dm ? fmtDateTime(dm[0]) : { date: "", time: "" };
        const date = dt.date;
        const at = date ? (dt.time ? `${date} ${dt.time}` : date) : "";
        const rest = dm ? line.replace(dm[0], " ") : line;
        const memo = (rest.match(/[가-힣]{2,}/) || [""])[0];
        const nums = (rest.match(/-?[\d,]+/g) || []).map((x) => Parsers.num(x)).filter((n) => !isNaN(n));
        if (nums.length < 2) return;
        // 맨 앞=No(순서), 맨 뒤=잔여(잔액), 가운데=적립/사용
        const seq = nums[0];
        const bal = nums[nums.length - 1];
        const mid = nums.slice(1, nums.length - 1);
        let up = 0, down = 0;
        mid.forEach((n) => { if (n < 0) down = Math.abs(n); else if (n > 0) up = n; });
        if (up > 0) out.push({ store, vendor, date, at, kind: "충전", amount: up, memo, bal, seq });
        else if (down > 0) out.push({ store, vendor, date, at, kind: "사용", amount: down, memo, bal, seq });
      });
      if (!out.length) { q("#dpp-prev").innerHTML = `<div class="err">읽을 줄이 없어요. 표를 복사해서 붙여넣었는지 확인해주세요.</div>`; return; }
      const { added, skipped } = addDepositsDedup(out);
      q("#dpp-prev").innerHTML = `<div class="ok">✅ ${out.length}건 인식 → ${added}건 추가${skipped ? `, 중복 ${skipped}건 건너뜀` : ""} (충전 ${out.filter((o) => o.kind === "충전").length} · 사용 ${out.filter((o) => o.kind === "사용").length})</div>`;
      S.save(); setTimeout(() => { close(); App.go("deposits"); }, 600);
    };
  }

  /* ===== 10) 정산서(발주정산내역서) 올리기 — 자동 인식 ===== */
  function importSettlement() {
    open("🧾 정산서(발주정산내역서) 올리기",
      `<p>발주정산내역서 엑셀을 올리면 <b>정산서</b>로 등록돼요. 여러 개 <b>한꺼번에</b> 선택 가능.<br>
        <span class="muted" style="font-size:12px">컬럼(번호·발주일자·받는분·품목·수량·공급가·배송비·합계)은 <b>자동 인식</b>, 스토어는 <b>파일명</b>으로 자동 구분돼요.</span></p>
       <div class="form-row two">
         <span><label>거래처 <span class="muted" id="se-vendor-auto" style="font-size:11px">(파일명에서 자동)</span></label><input id="se-vendor" placeholder="예: 해담별 / 일비" style="width:100%"></span>
         <span><label>기본 연/월 <span class="muted" style="font-size:11px">(발주일자에 연도 없을 때)</span></label><div>${ymSelect("se-year", "se-month")}</div></span>
       </div>
       <div class="form-row"><label>정산서 파일 (여러 개 가능)</label><input type="file" id="se-file" accept=".xlsx,.xls,.csv" multiple></div>
       <div id="se-prev" class="preview"></div>`,
      `<button class="btn" id="se-cancel">취소</button><button class="btn primary" id="se-apply" disabled>정산서에 추가</button>`);
    let files = [];
    const stLbl = (s) => s === "yb" ? "옐로우브릿지" : s === "groven" ? "그로븐" : "미지정";
    const nm = (h) => String(h.name).replace(/\s/g, "");
    q("#se-file").onchange = async (e) => {
      files = [];
      const fl = [...e.target.files]; if (!fl.length) return;
      q("#se-prev").innerHTML = `<div class="muted">읽는 중…</div>`;
      // 정산 컬럼(수량·상품/품목·받는분/수취인 등)이 있는 시트를 자동 선택 (해담별=2번째 시트)
      const sheetScore = (sh) => {
        const has = (re) => sh.headers.some((h) => re.test(nm(h)));
        return (has(/수량/) ? 1 : 0) + (has(/상품명|품목명|품명/) ? 1 : 0) + (has(/수취인|받는분|수령인/) ? 1 : 0) + (has(/공급가|상품가격|합계/) ? 1 : 0);
      };
      for (const f of fl) {
        const detected = /옐로우|옐브|yellow|yb|과세/i.test(f.name) ? "yb" : (/그로븐|groven|grov|면세/i.test(f.name) ? "groven" : "");
        try {
          const { sheets } = await Parsers.readSheets(f);
          let best = sheets[0], bs = -1;
          sheets.forEach((sh) => { const s = sheetScore(sh); if (s > bs || (s === bs && sh.body.length > best.body.length)) { bs = s; best = sh; } });
          files.push({ table: best, store: detected, name: f.name });
        } catch (err) { /* skip */ }
      }
      if (!files.length) { q("#se-prev").innerHTML = `<div class="err">읽을 수 있는 파일이 없어요.</div>`; return; }
      const fv = fileVendor(files[0].name);
      if (fv && q("#se-vendor") && !q("#se-vendor").value.trim()) q("#se-vendor").value = fv;
      const rows = files.reduce((a, x) => a + x.table.body.length, 0);
      q("#se-prev").innerHTML = `<div class="ok">✅ ${files.length}개 파일 (약 ${rows}행)<br>${files.map((x) => `· ${E(x.name)} → <b>${stLbl(x.store)}</b>`).join("<br>")}</div>`;
      q("#se-apply").disabled = false;
    };
    q("#se-cancel").onclick = close;
    q("#se-apply").onclick = () => {
      if (!files.length) return;
      const yr = +q("#se-year").value, mo = +q("#se-month").value;
      const baseVendor = q("#se-vendor") ? q("#se-vendor").value.trim() : "";
      lastYM = { y: yr, m: mo };
      const out = [];
      files.forEach(({ table, store, name }) => {
        const vendor = baseVendor || fileVendor(name);
        const H = table.headers;
        const idx = (re) => { const h = H.find((x) => re.test(nm(x))); return h ? h.index : -1; };
        const iDate = idx(/발주일|주문일|일자|날짜/), iName = idx(/수취인|받는분성|수령인/),
          iAddr = idx(/주소/), iItem = idx(/상품명|품목명|품명/), iQty = idx(/수량/),
          iSup = idx(/공급가|상품가격|상품금액/), iShip = idx(/^배송비$|배송비\(/), iTot = idx(/^합계$|합계\(|총합계|총액/);
        const iGu = idx(/발생구분|구분/); // 매출/리뷰/CS 등
        const iNo = idx(/주문번호|고유번호|^번호$|^no$/i); // 동명이인·합배송 구분용 고유번호
        table.body.forEach((r) => {
          const name = iName >= 0 ? Parsers.str(r[iName]) : "";
          const item = iItem >= 0 ? Parsers.str(r[iItem]) : "";
          if (!name && !item) return;
          if (/^합계|총\s*합계/.test(name) || /^합계/.test(Parsers.str(r[0]))) return;
          const qRaw = iQty >= 0 ? Parsers.str(r[iQty]) : "";
          const gu = iGu >= 0 ? Parsers.str(r[iGu]) : "";
          const review = /리뷰/.test(qRaw) || /리뷰/.test(gu);
          const dRaw = iDate >= 0 ? Parsers.str(r[iDate]) : "";
          const d = Parsers.parseDate(dRaw);
          out.push({ store, vendor, year: d.y || yr, month: d.m || mo, day: d.d || "", date: dRaw,
            recipient: name, addr: iAddr >= 0 ? Parsers.str(r[iAddr]) : "", item, no: iNo >= 0 ? Parsers.str(r[iNo]) : "", note: "",
            qty: review ? 0 : Parsers.num(qRaw), review,
            supply: iSup >= 0 ? Parsers.num(r[iSup]) : 0, ship: iShip >= 0 ? Parsers.num(r[iShip]) : 0, total: iTot >= 0 ? Parsers.num(r[iTot]) : 0 });
        });
      });
      if (!out.length) { q("#se-prev").innerHTML = `<div class="err">읽을 행이 없어요. (정산상세 시트를 못 찾았을 수 있어요)</div>`; return; }
      // 중복 = 같은 파일 재업로드만 거름. 같은 이름이어도 합배송·동명이인은 살림(주소·주문번호·건수 기준)
      const sig = (o) => `${o.store || ""}|${o.vendor || ""}|${o.year}|${o.month}|${o.day}|${o.recipient}|${o.addr}|${o.item}|${o.total}|${o.no}`;
      const existing = {}; (S.data.settlements || []).forEach((o) => { const k = sig(o); existing[k] = (existing[k] || 0) + 1; });
      const batch = {}; const fresh = []; let skipped = 0;
      out.forEach((o) => { const k = sig(o); const i = (batch[k] = (batch[k] || 0) + 1); if ((existing[k] || 0) >= i) { skipped++; } else { fresh.push(o); } });
      if (!fresh.length) { q("#se-prev").innerHTML = `<div class="err">모두 이미 등록된 정산이에요 (중복 ${skipped}건).</div>`; return; }
      fresh.forEach((s) => S.data.settlements.push(Object.assign({ id: S.uid() }, s)));
      if (App.scope) { App.scope.year = fresh[0].year; App.scope.month = fresh[0].month; }
      S.save(); close(); App.go("settlements");
      if (skipped) alert(`${fresh.length}건 추가, 중복 ${skipped}건은 건너뛰었어요.`);
    };
  }

  return { importExisting, importBank, importPO, importPaste, importEvidence, importOrders, importDeposits, importDepositPaste, importSettlement, editRow, close };
})();
