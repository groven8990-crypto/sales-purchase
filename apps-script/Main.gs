// ===== 메인 진입점 =====
// Google Apps Script 편집기에서 실행할 함수들

// 발주↔정산 대조 여부.
//  false = 정산서만 빠르게 읽음 (평소 마감, 6분 제한 안전)
//  true  = 발주서까지 읽어 수량 대조 (느림, 필요할 때만)
var DO_COMPARE = false;

// 알림: 메뉴에서 실행하면 팝업, 편집기에서 실행하면 로그로만 (오류 방지)
function notify(msg) {
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* 편집기 실행 시 무시 */ }
}

// 공급가가 0인데 합계가 있으면 합계로 공급가/부가세를 채움
function fillSupplyFromTotal(rows) {
  rows.forEach(function (r) {
    var supply = toNum(r[7]), total = toNum(r[9]);
    if (supply === 0 && total > 0) {
      if (r[10] === "yb") {           // 과세
        r[7] = Math.round(total / 1.1);
        r[8] = total - r[7];
      } else {                         // 면세(그로븐)
        r[7] = total;
        r[8] = 0;
      }
    }
  });
}

// ─────────────────────────────────────────────
// 1. 월 마감 자동화 (버튼 한 번으로 전체 처리)
// ─────────────────────────────────────────────

// 현재 달 기준 실행 (빠른 마감 — 정산서만)
function runThisMonthClosing() {
  DO_COMPARE = false;
  var now = new Date();
  var ym = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, "0");
  runMonthlyClosing(ym);
}

// 특정 연월 빠른 마감 (예: "2605" = 2026년 5월)
function runMay2026() {
  DO_COMPARE = false;
  runMonthlyClosing("2605");
}

// 2026년 5월 — 발주서까지 대조 (느림)
function runCompareMay2026() {
  DO_COMPARE = true;
  runMonthlyClosing("2605");
}

// 메인 함수
function runMonthlyClosing(yearMonth) {
  if (!yearMonth) {
    var now = new Date();
    yearMonth = String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, "0");
  }

  log("===== 매입·매출 마감 자동화 시작 =====");
  log("대상 연월: 20" + yearMonth.slice(0,2) + "년 " + yearMonth.slice(2) + "월");
  log("실행 시각: " + new Date().toLocaleString("ko-KR"));

  var ss = getOrCreateOutputSheet();

  // 시트 초기화
  var purchaseSheet  = resetSheet(ss, CONFIG.SHEET_PURCHASE,  CONFIG.OUTPUT_HEADERS);
  var b2bSheet       = resetSheet(ss, CONFIG.SHEET_B2B_SALES, CONFIG.OUTPUT_HEADERS);
  var compareSheet   = resetSheet(ss, CONFIG.SHEET_COMPARE,   CONFIG.OUTPUT_HEADERS);

  var allPurchase  = [];
  var allB2b       = [];
  var allCompare   = [];

  // ── 푸드엔드베스트 ──
  try {
    var food = processFoodAndBest(yearMonth);
    allPurchase = allPurchase.concat(food.purchaseRows);
    allCompare  = allCompare.concat(food.compareRows);
  } catch(e) { log("❌ 푸드엔드베스트 오류: " + e.message); }

  // ── 일비 ──
  try {
    var ilbi = processIlbi(yearMonth);
    allPurchase = allPurchase.concat(ilbi.purchaseRows);
    allB2b      = allB2b.concat(ilbi.b2bSalesRows);
    allCompare  = allCompare.concat(ilbi.compareRows);
  } catch(e) { log("❌ 일비 오류: " + e.message); }

  // ── 해담별 ──
  try {
    var haed = processHaedambyul(yearMonth);
    allPurchase = allPurchase.concat(haed.purchaseRows);
  } catch(e) { log("❌ 해담별 오류: " + e.message); }

  // ── 디네트 ──
  try {
    var dinet = processDinet(yearMonth);
    allPurchase = allPurchase.concat(dinet.purchaseRows);
  } catch(e) { log("❌ 디네트 오류: " + e.message); }

  // ── 결과 쓰기 ──
  // 공급가가 비어있으면(정산서에 공급가 열 없음) 합계로 채움.
  //  면세: 공급가=합계, 부가세=0 / 과세(yb): 공급가=합계÷1.1, 부가세=나머지
  fillSupplyFromTotal(allPurchase);
  fillSupplyFromTotal(allB2b);

  appendRows(purchaseSheet, allPurchase);
  appendRows(b2bSheet, allB2b);
  appendRows(compareSheet, allCompare);

  // 금액 열 형식 (공급가=H, 부가세=I, 합계=J → 인덱스 7,8,9)
  if (allPurchase.length) {
    formatCurrencyCols(purchaseSheet, [6, 7, 8, 9], 2, allPurchase.length + 1);
  }
  if (allB2b.length) {
    formatCurrencyCols(b2bSheet, [6, 7, 8, 9], 2, allB2b.length + 1);
  }
  if (allCompare.length) {
    // 대조결과 열(인덱스 12) 색상 표시
    highlightCompareSheet(compareSheet, allCompare.length);
  }

  // 요약 시트
  writeSummarySheet(ss, allPurchase, allB2b, allCompare, yearMonth);

  // 변환용 임시 파일 정리
  cleanupTempFiles();

  // 로그 기록
  flushLog(ss);

  // 완료 안내
  var summary = "✅ 완료: 매입 " + allPurchase.length + "건 / B2B매출 " + allB2b.length +
    "건 / 대조 " + allCompare.length + "건\n스프레드시트: " + ss.getUrl();
  log(summary);
  notify(summary);

  return ss.getUrl();
}

// ─────────────────────────────────────────────
// 2. 마감앱 import용 Excel 내보내기
// ─────────────────────────────────────────────

// 마감앱에 올릴 수 있는 xlsx 파일을 드라이브에 저장
function exportForClosingApp() {
  var ss = getOrCreateOutputSheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_PURCHASE);
  if (!sheet) { notify("먼저 runMonthlyClosing을 실행하세요."); return; }

  // 현재 날짜로 파일명 생성
  var now = new Date();
  var stamp = Utilities.formatDate(now, "Asia/Seoul", "yyMMdd");
  var fileName = "장부_매입내역_" + stamp + ".xlsx";

  // Google Sheets → xlsx 변환
  var xlsxBlob = DriveApp.getFileById(ss.getId()).getAs("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  xlsxBlob.setName(fileName);
  var savedFile = DriveApp.createFile(xlsxBlob);

  var msg = "Excel 파일 저장 완료!\n파일명: " + fileName + "\n위치: " + savedFile.getUrl();
  log(msg);
  notify(msg);
}

// ─────────────────────────────────────────────
// 3. 보조 함수
// ─────────────────────────────────────────────

// 드라이브 정리: 남은 tmp_ 찌꺼기 삭제 + 결과 시트를 '클로드작업' 폴더로 이동
function tidyDrive() {
  var folderId = getClaudeFolderId();
  var folder = DriveApp.getFolderById(folderId);

  // 1) 결과 시트를 클로드작업 폴더로 이동
  if (CONFIG.OUTPUT_SHEET_ID) {
    try { DriveApp.getFileById(CONFIG.OUTPUT_SHEET_ID).moveTo(folder); } catch(e) {}
  }

  // 2) 어디에 있든 tmp_ 로 시작하는 변환 찌꺼기 휴지통으로
  var trashed = 0;
  var tmp = DriveApp.searchFiles('title contains "tmp_" and trashed = false');
  while (tmp.hasNext()) {
    var f = tmp.next();
    if (f.getName().indexOf("tmp_") === 0) { f.setTrashed(true); trashed++; }
  }

  notify(
    "정리 완료!\n· 결과 시트 → '클로드작업' 폴더로 이동\n· 임시파일 " + trashed + "개 휴지통으로 이동");
}

// '내 드라이브' 최상위에 흩어진 파일을 모두 '클로드작업' 폴더로 쓸어담기
// (다른 클로드 대화에서 만든 시트 포함 — 옮기는 것이라 되돌리기 가능)
function gatherLooseFilesToFolder() {
  var folder = DriveApp.getFolderById(getClaudeFolderId());
  var files = DriveApp.getRootFolder().getFiles();
  var moved = 0, trashed = 0, names = [];
  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    if (name.indexOf("tmp_") === 0) { f.setTrashed(true); trashed++; continue; } // 찌꺼기는 삭제
    try { f.moveTo(folder); moved++; if (names.length < 25) names.push("· " + name); }
    catch(e) {}
  }
  notify(
    moved + "개를 '클로드작업' 폴더로 옮겼어요. (임시 " + trashed + "개 삭제)\n\n"
    + names.join("\n") + (moved > 25 ? "\n…외" : ""));
}



// 대조결과 열 색상 표시 (🔴=빨강, ⚠️=노랑, ✅=초록)
function highlightCompareSheet(sheet, rowCount) {
  if (rowCount < 1) return;
  var colIdx = 13; // 대조결과 = 13번째 열 (1-based)
  for (var r = 2; r <= rowCount + 1; r++) {
    var cell = sheet.getRange(r, colIdx);
    var val  = String(cell.getValue());
    if (val.indexOf("🔴") !== -1) {
      sheet.getRange(r, 1, 1, CONFIG.OUTPUT_HEADERS.length).setBackground("#fdeaea");
    } else if (val.indexOf("⚠️") !== -1) {
      sheet.getRange(r, 1, 1, CONFIG.OUTPUT_HEADERS.length).setBackground("#fef9c3");
    } else if (val.indexOf("✅") !== -1) {
      sheet.getRange(r, 1, 1, CONFIG.OUTPUT_HEADERS.length).setBackground("#f0fdf4");
    }
  }
}

// 요약 시트 작성
function writeSummarySheet(ss, purchaseRows, b2bRows, compareRows, yearMonth) {
  var sh = resetSheet(ss, "요약", []);
  var ym = "20" + yearMonth.slice(0,2) + "년 " + yearMonth.slice(2) + "월";

  // 매입 합계
  var totalSupply = 0, totalTax = 0, totalAmt = 0;
  purchaseRows.forEach(function(r) {
    totalSupply += toNum(r[7]);
    totalTax    += toNum(r[8]);
    totalAmt    += toNum(r[9]);
  });

  // B2B 매출 합계
  var b2bSupply = 0, b2bTotal = 0;
  b2bRows.forEach(function(r) {
    b2bSupply += toNum(r[7]);
    b2bTotal  += toNum(r[9]);
  });

  // 대조 불일치 수
  var issues = compareRows.filter(function(r) {
    return String(r[12]).indexOf("🔴") !== -1 || String(r[12]).indexOf("⚠️") !== -1;
  }).length;

  var data = [
    ["매입·매출 마감 자동화 요약", ""],
    ["대상 기간", ym],
    ["실행 일시", new Date().toLocaleString("ko-KR")],
    ["", ""],
    ["── 매입 ──", ""],
    ["총 건수",    purchaseRows.length + "건"],
    ["공급가 합계", totalSupply],
    ["부가세 합계", totalTax],
    ["합계 금액",   totalAmt],
    ["", ""],
    ["── B2B 매출 (현해랑) ──", ""],
    ["총 건수",    b2bRows.length + "건"],
    ["공급가 합계", b2bSupply],
    ["합계 금액",   b2bTotal],
    ["", ""],
    ["── 발주↔정산 대조 ──", ""],
    ["전체 대조 항목",    compareRows.length + "건"],
    ["불일치·미확인 항목", issues + "건 (매입내역 시트 확인)"],
  ];

  sh.getRange(1, 1, data.length, 2).setValues(data);
  sh.getRange(1, 1).setFontSize(14).setFontWeight("bold");
  sh.getRange(2, 1, data.length - 1, 2).setFontSize(11);

  // 금액 형식
  [7, 8, 9, 13, 14].forEach(function(rowNum) {
    try {
      sh.getRange(rowNum, 2).setNumberFormat("#,##0");
    } catch(e) {}
  });

  sh.setColumnWidth(1, 180);
  sh.setColumnWidth(2, 220);
}

// ─────────────────────────────────────────────
// 4. 메뉴 등록 (스프레드시트 열릴 때 자동 실행)
// ─────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🧾 매입 마감")
    .addItem("▶ 이번 달 마감 (빠름·정산서만)", "runThisMonthClosing")
    .addSeparator()
    .addItem("▶ 2026년 5월 마감 (빠름)", "runMay2026")
    .addItem("🔍 2026년 5월 + 발주 대조 (느림)", "runCompareMay2026")
    .addSeparator()
    .addItem("📥 마감앱용 Excel 내보내기", "exportForClosingApp")
    .addItem("🧹 드라이브 정리 (찌꺼기 삭제)", "tidyDrive")
    .addItem("📦 흩어진 파일 → 클로드작업 폴더로 모으기", "gatherLooseFilesToFolder")
    .addToUi();
}
