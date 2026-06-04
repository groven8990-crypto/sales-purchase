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
      vendor: ["거래처", "업체", "공급처", "공급업체", "vendor", "상호", "거래선"],
      desc: ["품목", "상품", "내용", "내역", "품명", "item"],
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
      { k: "type", l: "입출구분", t: "sel", opts: () => [["in", "입금"], ["out", "출금"]] },
      { k: "category", l: "분류", t: "sel", opts: () => S.CATEGORIES.concat(["매출정산"]) },
      { k: "desc", l: "내용", t: "text", wide: true },
      { k: "counterparty", l: "거래처", t: "text", wide: true },
      { k: "amount", l: "금액", t: "num" },
      { k: "bank", l: "은행", t: "text" }, { k: "account", l: "계좌번호", t: "text" },
      { k: "note", l: "비고", t: "text", wide: true },
    ],
  };
  const KIND_LABEL = { purchases: "매입", sales: "매출", transactions: "입출금" };

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
        input = `<input id="ed-${f.k}" type="${f.t === "num" ? "number" : "text"}" value="${E(v)}">`;
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
        스토어는 <b>그로븐</b> 또는 <b>옐브</b>(=옐로우브릿지). 건수는 없으면 비워도 돼요.</p>
       <div class="form-row two">
         <span><label>기본 연/월</label><input id="ps-ym" placeholder="예: 2026-5"></span>
         <span><label>분류</label><select id="ps-cat">${S.CATEGORIES.map((x) => `<option ${x === "상품매입" ? "selected" : ""}>${x}</option>`).join("")}</select></span>
       </div>
       <div class="form-row"><label>매입 줄 (거래처, 스토어, 금액, 건수)</label>
         <textarea id="ps-text" rows="12" style="width:100%;font-family:monospace;font-size:12.5px" placeholder="공덕농협, 옐브, 36000, 2&#10;생선상륙, 그로븐, 36500, 3"></textarea></div>
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
        const amount = S.num(p[2]);
        const count = p[3] ? S.num(p[3]) : 1;
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

  return { importExisting, importBank, importPO, importPaste, editRow, close };
})();
