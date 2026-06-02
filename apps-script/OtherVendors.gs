// ===== 해담별 · 디네트 파서 =====
// 정산서 형식이 아직 파악되지 않아 범용 파서로 처리.
// 향후 실제 파일 구조 확인 후 전용 파서로 교체 권장.

// 범용 정산서 파서 (헤더 키워드 기반 열 자동 탐지)
function parseGenericJungsan(fileId, vendorName) {
  var ss = openAsSpreadsheet(fileId);
  var filename = DriveApp.getFileById(fileId).getName();
  var rows = [];

  ss.getSheets().forEach(function(sheet) {
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return;

    // 헤더 탐색
    var headerRow = -1;
    var keywords = ["날짜", "품목", "수량", "단가", "금액", "공급가", "합계", "거래처"];
    for (var i = 0; i < Math.min(10, data.length); i++) {
      var score = 0;
      data[i].forEach(function(cell) {
        var s = String(cell).trim();
        keywords.forEach(function(kw) { if (s.indexOf(kw) !== -1) score++; });
      });
      if (score >= 2) { headerRow = i; break; }
    }
    if (headerRow === -1) return;

    var h = data[headerRow];
    var iDate   = colIdxAny(h, ["날짜", "일자", "date"]);
    var iItem   = colIdxAny(h, ["품목", "상품명", "item", "제품명"]);
    var iGrade  = colIdxAny(h, ["규격", "등급"]);
    var iQty    = colIdxAny(h, ["수량", "qty"]);
    var iPrice  = colIdxAny(h, ["단가", "price"]);
    var iSupply = colIdxAny(h, ["공급가", "공급액"]);
    var iTax    = colIdxAny(h, ["부가세", "vat", "세액"]);
    var iTotal  = colIdxAny(h, ["합계", "금액", "total"]);
    var iStore  = colIdxAny(h, ["스토어", "구분", "매장"]);
    var iNote   = colIdxAny(h, ["비고", "메모"]);

    for (var r = headerRow + 1; r < data.length; r++) {
      var row = data[r];
      var supply = iSupply !== -1 ? toNum(row[iSupply]) : 0;
      var total  = iTotal  !== -1 ? toNum(row[iTotal])  : 0;
      if (supply === 0 && total === 0) continue;

      var storeRaw = iStore !== -1 ? String(row[iStore] || "").trim() : "";
      var storeKey = CONFIG.STORE_MAP[storeRaw] || "groven";
      var rawDate  = iDate !== -1 ? row[iDate] : "";

      rows.push([
        fmtDate(rawDate),                              // 날짜
        vendorName,                                    // 거래처
        "매입",                                        // 분류
        iItem   !== -1 ? String(row[iItem]   || "") : "", // 품목
        iGrade  !== -1 ? String(row[iGrade]  || "") : "", // 규격
        iQty    !== -1 ? toNum(row[iQty])    : null,   // 수량
        iPrice  !== -1 ? toNum(row[iPrice])  : 0,      // 단가
        supply,                                        // 공급가
        iTax    !== -1 ? toNum(row[iTax])    : 0,      // 부가세
        total   || supply,                             // 합계
        storeKey,                                      // 스토어
        iNote   !== -1 ? String(row[iNote]   || "") : "", // 메모
        "✅ (자동인식)",                               // 대조결과
        filename,                                      // 원본파일
      ]);
    }
  });

  return rows;
}

// 해담별 처리
function processHaedambyul(yearMonth) {
  log("[해담별] 처리 시작: " + yearMonth);
  var files = listFilesInFolder(CONFIG.FOLDER.HAEDAMBYUL, yearMonth);
  log("  정산서: " + files.length + "개");

  var allRows = [];
  files.forEach(function(f) {
    try {
      var rows = parseGenericJungsan(f.id, "해담별");
      allRows = allRows.concat(rows);
      log("  " + f.name + ": " + rows.length + "건");
    } catch(e) { log("  ⚠️ " + f.name + ": " + e.message); }
  });

  log("[해담별] 완료: " + allRows.length + "건");
  return { purchaseRows: allRows };
}

// 디네트 처리
function processDinet(yearMonth) {
  log("[디네트] 처리 시작: " + yearMonth);
  var files = listFilesInFolder(CONFIG.FOLDER.DINET, yearMonth);
  log("  정산서: " + files.length + "개");

  var allRows = [];
  files.forEach(function(f) {
    try {
      var rows = parseGenericJungsan(f.id, "디네트");
      allRows = allRows.concat(rows);
      log("  " + f.name + ": " + rows.length + "건");
    } catch(e) { log("  ⚠️ " + f.name + ": " + e.message); }
  });

  log("[디네트] 완료: " + allRows.length + "건");
  return { purchaseRows: allRows };
}
