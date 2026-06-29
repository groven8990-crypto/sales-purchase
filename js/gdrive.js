/* =============================================================
 *  gdrive.js — 구글드라이브에서 발주서·정산서 직접 가져오기
 *  (정적 사이트 → Google Identity Services 토큰 + Drive REST API)
 *  서버 없이 동작. 최초 1회 OAuth 클라이언트 ID만 설정하면 됨.
 * ============================================================= */
const GDrive = (function () {
  const S = SPC;
  const E = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
  // 웹 OAuth 클라이언트 ID는 공개 값(브라우저 노출)이라 기본값으로 넣어둠. 접근은 본인 로그인 + 등록 도메인에서만.
  const DEFAULT_CLIENT_ID = "215210820068-un89iorav0ih78q2dl5lvdl65oveedph.apps.googleusercontent.com";
  const CFG_KEY = "spc_gdrive";
  const cfg = () => { try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; } };
  const saveCfg = (c) => localStorage.setItem(CFG_KEY, JSON.stringify(c));
  // 이미 가져온 파일 기록 (kind별 fileId→modifiedTime) — 새 파일만 받기용
  const IMP_KEY = "spc_gdrive_imported";
  const impMap = () => { try { return JSON.parse(localStorage.getItem(IMP_KEY)) || {}; } catch (e) { return {}; } };
  const saveImp = (m) => localStorage.setItem(IMP_KEY, JSON.stringify(m));

  const SPEC = {
    orders: { label: "발주서", folderHint: "발주관리", target: "orders", view: "orders" },
    settlements: { label: "정산서", folderHint: "정산", target: "settlements", view: "settlements" },
  };

  let accessToken = "";

  /* --- GIS 스크립트 로드 --- */
  function loadGIS() {
    return new Promise((res, rej) => {
      if (window.google && google.accounts && google.accounts.oauth2) return res();
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true; s.defer = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error("구글 로그인 스크립트를 불러오지 못했어요. (네트워크 확인)"));
      document.head.appendChild(s);
    });
  }

  /* --- 액세스 토큰 받기 (버튼 클릭 제스처 안에서 호출) --- */
  function getToken(clientId) {
    return new Promise((res, rej) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: SCOPE,
        callback: (r) => { if (r && r.access_token) { accessToken = r.access_token; res(accessToken); } else { rej(new Error("로그인이 취소되었거나 권한을 받지 못했어요.")); } },
        error_callback: (e) => rej(new Error("로그인 오류: " + (e && e.type ? e.type : "unknown"))),
      });
      tc.requestAccessToken({ prompt: accessToken ? "" : "consent" });
    });
  }

  /* --- Drive REST --- */
  async function api(qs) {
    const r = await fetch("https://www.googleapis.com/drive/v3/files?" + qs, { headers: { Authorization: "Bearer " + accessToken } });
    if (r.status === 401) { accessToken = ""; throw new Error("인증이 만료됐어요. 다시 연결해 주세요."); }
    if (!r.ok) throw new Error("드라이브 API 오류 (" + r.status + ")");
    return r.json();
  }
  async function apiOne(fileId) {
    try {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name`, { headers: { Authorization: "Bearer " + accessToken } });
      return r.ok ? r.json() : null;
    } catch (e) { return null; }
  }
  async function findFolders(hint) {
    const q = `mimeType='application/vnd.google-apps.folder' and name contains '${hint.replace(/'/g, "\\'")}' and trashed=false`;
    const j = await api("q=" + encodeURIComponent(q) + "&fields=files(id,name,parents)&pageSize=40&orderBy=name");
    const folders = j.files || [];
    // 상위 폴더명 가져오기 (같은 이름 폴더 구분용)
    const parentIds = [...new Set(folders.flatMap((f) => f.parents || []))];
    const pmap = {};
    await Promise.all(parentIds.map(async (pid) => { const pf = await apiOne(pid); if (pf) pmap[pid] = pf.name; }));
    folders.forEach((f) => {
      const pid = (f.parents || [])[0];
      f.driveParentName = pid ? (pmap[pid] || "") : "";
    });
    return folders;
  }
  async function listChildren(folderId, pageToken) {
    const q = `'${folderId}' in parents and trashed=false`;
    const j = await api("q=" + encodeURIComponent(q) + "&fields=nextPageToken,files(id,name,mimeType,modifiedTime)&pageSize=200" + (pageToken ? "&pageToken=" + pageToken : ""));
    return j;
  }
  // 폴더(및 하위 폴더 최대 3단계) 안의 엑셀 파일 모으기. 각 파일에 부모 폴더명(=거래처) 기록.
  async function collectFiles(rootId, rootName) {
    const FOLDER = "application/vnd.google-apps.folder";
    const files = [];
    let frontier = [{ id: rootId, name: rootName, depth: 0 }];
    const seen = new Set();
    while (frontier.length) {
      const next = [];
      for (const fol of frontier) {
        if (seen.has(fol.id)) continue; seen.add(fol.id);
        let pt = "";
        do {
          const j = await listChildren(fol.id, pt);
          (j.files || []).forEach((f) => {
            if (f.mimeType === FOLDER) { if (fol.depth < 3) next.push({ id: f.id, name: f.name, depth: fol.depth + 1 }); }
            else files.push({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, parentName: fol.name, isRoot: fol.depth === 0 });
          });
          pt = j.nextPageToken || "";
        } while (pt);
      }
      frontier = next;
    }
    return files;
  }
  function isSheetFile(f) {
    const n = f.name || "";
    if (/변환|템플릿|template|thumbs|양식|등록\s*방법|작성\s*방법|매뉴얼|manual/i.test(n)) return false;
    if (/\.(xlsx|xls|csv)$/i.test(n)) return true;
    return /spreadsheetml|ms-excel|csv|google-apps\.spreadsheet/i.test(f.mimeType || "");
  }
  async function download(f) {
    let url;
    if (/google-apps\.spreadsheet/.test(f.mimeType || "")) {
      url = `https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}`;
    } else {
      url = `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`;
    }
    const r = await fetch(url, { headers: { Authorization: "Bearer " + accessToken } });
    if (!r.ok) throw new Error("다운로드 실패: " + f.name);
    const blob = await r.blob();
    const fname = /\.(xlsx|xls|csv)$/i.test(f.name) ? f.name : f.name + ".xlsx";
    return new File([blob], fname, { type: blob.type });
  }

  /* --- 모달 UI --- */
  const M = () => document.querySelector(".modal");
  const qq = (sel) => M() && M().querySelector(sel);
  function setStatus(html) { const el = qq("#gd-status"); if (el) el.innerHTML = html; }

  function openFor(kind) {
    const spec = SPEC[kind]; if (!spec) return;
    const c = cfg();
    const savedFolder = (c.folders && c.folders[kind]) || null;
    Modals.open(`📁 구글드라이브에서 ${spec.label} 가져오기`,
      `<p>구글드라이브 폴더의 ${spec.label} 엑셀을 앱이 직접 읽어 등록해요. 하위(거래처) 폴더까지 자동으로 훑어요.</p>
       <div class="form-row"><label>구글 OAuth 클라이언트 ID <span class="muted" style="font-size:11px">(최초 1회만)</span></label>
         <input id="gd-cid" placeholder="0000....apps.googleusercontent.com" value="${E(c.clientId || DEFAULT_CLIENT_ID)}" style="width:100%"></div>
       ${savedFolder ? `<div class="hint">최근 사용 폴더: <b>${E(savedFolder.name)}</b> <button class="btn" id="gd-usesaved" style="padding:2px 8px;margin-left:6px">이 폴더로 바로 가져오기</button></div>` : ""}
       <label style="display:block;margin-top:8px;font-size:13px"><input type="checkbox" id="gd-newonly" checked> ⚡ <b>새로 올라온 파일만</b> 가져오기 (이미 가져온 파일은 건너뛰기 — 빠름)</label>
       <label style="display:block;margin-top:5px;font-size:13px"><input type="checkbox" id="gd-sample"> 🔎 거래처별 <b>최신 1일치만</b> 가져오기 (점검용 — 원본+회신 같이 와서 송장번호까지 확인)</label>
       <div id="gd-status" class="preview" style="margin-top:8px"></div>
       <div id="gd-folders" style="margin-top:8px"></div>
       <details class="help" style="margin-top:10px"><summary>ℹ️ 클라이언트 ID 설정 방법 (최초 1회)</summary><div class="hb">
         <ol style="margin:0;padding-left:18px;line-height:1.7">
           <li><b>console.cloud.google.com</b> 접속 → 새 프로젝트 만들기</li>
           <li>'API 및 서비스' → '라이브러리' → <b>Google Drive API</b> 검색 후 '사용'</li>
           <li>'OAuth 동의 화면' → 외부(External) → 본인 이메일을 <b>테스트 사용자</b>로 추가</li>
           <li>'사용자 인증 정보' → '+ 사용자 인증 정보 만들기' → <b>OAuth 클라이언트 ID</b> → 유형 <b>웹 애플리케이션</b></li>
           <li>'승인된 자바스크립트 원본'에 <b>https://groven8990-crypto.github.io</b> 추가</li>
           <li>만들어진 <b>클라이언트 ID</b>를 위 칸에 붙여넣기 (한 번 넣으면 기억돼요)</li>
         </ol>
         <p class="muted" style="margin:6px 0 0">읽기 전용 권한만 사용하고, ID·토큰은 이 브라우저에만 저장돼요.</p>
       </div></details>`,
      `<button class="btn" id="gd-close">닫기</button><button class="btn primary" id="gd-connect">🔗 구글 연결 / 폴더 찾기</button>`);
    qq("#gd-close").onclick = Modals.close;
    qq("#gd-connect").onclick = () => connectAndFind(kind);
    if (savedFolder) { const b = qq("#gd-usesaved"); if (b) b.onclick = () => connectThenImport(kind, savedFolder); }
  }

  async function ensureToken() {
    const cid = (qq("#gd-cid").value || "").trim();
    if (!cid) { setStatus(`<div class="err">먼저 OAuth 클라이언트 ID를 넣어주세요. (아래 '설정 방법' 참고)</div>`); throw new Error("no client id"); }
    const c = cfg(); c.clientId = cid; saveCfg(c);
    setStatus(`<div class="muted">구글 로그인 준비 중…</div>`);
    await loadGIS();
    setStatus(`<div class="muted">구글 로그인 창을 확인하세요…</div>`);
    await getToken(cid);
  }

  async function connectAndFind(kind) {
    const spec = SPEC[kind];
    try {
      await ensureToken();
      setStatus(`<div class="muted">'${spec.folderHint}' 폴더 찾는 중…</div>`);
      const fols = await findFolders(spec.folderHint);
      if (!fols.length) { setStatus(`<div class="err">'${spec.folderHint}' 이름의 폴더를 못 찾았어요. 폴더 이름을 확인해 주세요.</div>`); return; }
      setStatus(`<div class="ok">✅ 연결됨. 가져올 폴더를 고르세요.</div>`);
      qq("#gd-folders").innerHTML = `<div class="form-row"><label>폴더 선택</label>
        <div>${fols.map((f, i) => `<label style="display:flex;align-items:center;gap:6px;padding:5px 0;cursor:pointer">
          <input type="radio" name="gd-fol" value="${i}" ${i === 0 ? "checked" : ""} style="flex-shrink:0">
          <span>
            ${f.driveParentName ? `<span style="font-size:11px;color:var(--muted);background:#f1f3f5;border-radius:4px;padding:1px 6px;margin-right:4px">${E(f.driveParentName)}</span>` : ""}${E(f.name)}
          </span>
        </label>`).join("")}</div></div>
        <button class="btn primary" id="gd-import">⬇️ 이 폴더에서 ${spec.label} 가져오기</button>`;
      qq("#gd-import").onclick = () => {
        const sel = M().querySelector("input[name=gd-fol]:checked");
        const f = fols[sel ? +sel.value : 0];
        const c = cfg(); c.folders = c.folders || {}; c.folders[kind] = { id: f.id, name: f.name }; saveCfg(c);
        runImport(kind, f);
      };
    } catch (e) { if (e.message !== "no client id") setStatus(`<div class="err">${E(e.message)}</div>`); }
  }

  async function connectThenImport(kind, folder) {
    try { await ensureToken(); await runImport(kind, folder); }
    catch (e) { if (e.message !== "no client id") setStatus(`<div class="err">${E(e.message)}</div>`); }
  }

  async function runImport(kind, folder) {
    const spec = SPEC[kind];
    const fld = qq("#gd-folders"); if (fld) fld.innerHTML = "";
    setStatus(`<div class="muted">📂 ${E(folder.name)} 안의 파일 목록을 읽는 중…</div>`);
    let files;
    try { files = await collectFiles(folder.id, folder.name); }
    catch (e) { setStatus(`<div class="err">${E(e.message)}</div>`); return; }
    let sheetFiles = files.filter(isSheetFile);
    // 발주: 파일명에 '발주'(발주서 등) 또는 회신표시(회신·운송장·송장)만. 그 외(정산·기타)는 건너뜀
    if (kind === "orders") sheetFiles = sheetFiles.filter((f) => /발주|회신|운송장|송장/.test(f.name || ""));
    if (!sheetFiles.length) { setStatus(`<div class="err">폴더에서 ${spec.label} 엑셀을 못 찾았어요.</div>`); return; }
    // 새로 올라온 파일만: 이미 가져온(같은 수정시각) 파일은 건너뜀
    const imp = impMap(); const impK = imp[kind] = imp[kind] || {};
    const onlyNew = qq("#gd-newonly") && qq("#gd-newonly").checked;
    let skippedExisting = 0;
    if (onlyNew) {
      const before = sheetFiles.length;
      sheetFiles = sheetFiles.filter((f) => impK[f.id] !== f.modifiedTime);
      skippedExisting = before - sheetFiles.length;
    }
    if (!sheetFiles.length) { setStatus(`<div class="ok">✅ 새로 가져올 ${spec.label}가 없어요. (이미 가져온 ${skippedExisting}개)</div>`); setTimeout(() => Modals.close(), 1400); return; }
    // 점검용: 거래처(하위폴더)별 '최신 1일치' 전부 (원본+회신 같이 와야 송장번호 매칭 확인 가능)
    const sample = qq("#gd-sample") && qq("#gd-sample").checked;
    if (sample) {
      const dateOf = (n) => { const h = String(n).trim().split(/[\s_\-]/)[0]; return /^\d{4,6}$/.test(h) ? h : "0"; };
      const groups = {};
      sheetFiles.forEach((f) => { const k = f.isRoot ? "__root__" : (f.parentName || "?"); (groups[k] = groups[k] || []).push(f); });
      const picked = [];
      Object.values(groups).forEach((arr) => {
        const maxD = arr.reduce((m, f) => { const d = dateOf(f.name); return d > m ? d : m; }, "000000");
        arr.forEach((f) => { if (dateOf(f.name) === maxD) picked.push(f); });
      });
      sheetFiles = picked;
      setStatus(`<div class="muted">🔎 점검 모드: 거래처별 최신 1일치(원본+회신) <b>${sheetFiles.length}개</b>만 가져와요…</div>`);
    }

    const yr = (App.scope && App.scope.year) || new Date().getFullYear();
    const mo = (App.scope && App.scope.month) || (new Date().getMonth() + 1);
    const isReply = (n) => /회신|운송장|송장/.test(n || ""); // 회신(송장번호) 파일 판별
    const out = [], replies = [];
    let done = 0, failed = 0, replyFiles = 0;
    for (const f of sheetFiles) {
      done++;
      setStatus(`<div class="muted">⬇️ (${done}/${sheetFiles.length}) ${E(f.name)} 읽는 중…</div>`);
      try {
        const file = await download(f);
        const baseVendor = f.isRoot ? "" : (f.parentName || ""); // 하위 폴더명 = 거래처
        if (kind === "orders") {
          const t = await Parsers.readGenericTable(file);
          if (isReply(f.name)) { Modals.buildTracking(t, { name: f.name }).forEach((e) => replies.push(e)); replyFiles++; }
          else Modals.buildOrders(t, { name: f.name, baseVendor, yr, mo }).forEach((o) => out.push(o));
        } else {
          const { sheets } = await Parsers.readSheets(file);
          const best = Modals.settlementSheetPick(sheets);
          Modals.buildSettlements(best, { name: f.name, baseVendor, yr, mo }).forEach((o) => out.push(o));
        }
        impK[f.id] = f.modifiedTime; // 처리 성공 → 가져온 파일로 기록
        if (done % 10 === 0) saveImp(imp); // 중간에 끊겨도 진행분 보존
      } catch (e) { failed++; }
    }
    saveImp(imp);
    if (!out.length && !replies.length) { setStatus(`<div class="err">읽을 행이 없었어요. (파일 ${sheetFiles.length}개${failed ? `, 실패 ${failed}개` : ""})</div>`); return; }
    const res = kind === "orders" ? Modals.addOrdersDedup(out) : Modals.addSettlementsDedup(out);
    const tracked = kind === "orders" ? Modals.applyTracking(replies) : 0; // 회신 송장번호를 같은 받는분+주소 발주에 채움
    if (res.first && App.scope) { App.scope.year = res.first.year; App.scope.month = res.first.month; }
    setStatus(`<div class="ok">✅ 파일 ${sheetFiles.length}개 처리 — <b>${res.added}건 추가</b>${res.skipped ? `, 중복 ${res.skipped}건` : ""}${replyFiles ? `, 회신 ${replyFiles}개→송장 ${tracked}건 매칭` : ""}${skippedExisting ? `, 기존 ${skippedExisting}개 건너뜀` : ""}${failed ? `, 실패 ${failed}개` : ""}</div>`);
    setTimeout(() => { Modals.close(); App.go(spec.view); }, 1400);
  }

  return { run: openFor };
})();
