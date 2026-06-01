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
      // 미리보기에서 수정된 분류 반영
      result.txns.forEach((t, i) => {
        const sel = q(`#bk-cat-${i}`); if (sel) t.category = sel.value;
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
      vendor: ["업체", "거래처", "공급", "vendor", "상호"],
      desc: ["품목", "상품", "내용", "내역", "품명", "item"],
      qty: ["수량", "qty", "개수"],
      supply: ["공급가", "단가", "공급"],
      vat: ["세액", "부가", "vat", "세금"],
      total: ["합계", "금액", "총액", "amount", "total", "공급대가"],
    }[field] || [];
    return k.some((x) => n.toLowerCase().includes(x.toLowerCase()));
  }

  return { importExisting, importBank, importPO, close };
})();
