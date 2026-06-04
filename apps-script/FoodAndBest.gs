// ===== 푸드엔드베스트 파서 =====
// 발주서: 1k--9pdo6xvgudwsFr4gWDorCYt7BLpFN
// 정산서(거래내역서): 15tGauMhnwqjuuVwtdjJdsYlNuhQtXHst
//
// 발주서 구조 (baljoo 앱 출력):
//   품목명 = "100g 10팩", "140g 5팩" 등
//   보내는분 = 로또상회(groven) 또는 자꾸가게(yb)
//   금액 없음
//
// 정산서(거래내역서) 구조:
//   시트명 = "그로븐" / "YB" (또는 유사)
//   열: 날짜, 품목(규격), 수량, 단가, 공급가, 부가세, 합계, 비고

// 발주서에서 품목 파싱 (baljoo 앱 출력 형식)
function parseFoodBaljoo(fileId) {
  var ss = openAsSpreadsheet(fileId);
  var filename = DriveApp.getFileById(fileId).getName();
  var fileDate = dateFromFilename(filename);
  var items = [];

  ss.getSheets().forEach(function(sheet) {
    var d = sheetToRows(sheet);
    if (!d.rows.length) return;
    var h = d.headers;

    // 열 인덱스
    var iItem   = colIdxAny(h, ["품목명", "품목", "상품명", "item"]);
    var iQty    = colIdxAny(h, ["수량", "qty", "개수"]);
    var iSender = colIdxAny(h, ["보내는분", "주문자", "발주처"]);
    var iNote   = colIdxAny(h, ["비고", "메모", "note"]);

    if (iItem === -1) return; // 발주 내용 없는 시트 스킵

    d.rows.forEach(function(row) {
      var itemName = String(row[iItem] || "").trim();
      if (!itemName) return;

      var sender = iSender !== -1 ? String(row[iSender] || "").trim() : "";
      var store  = CONFIG.STORE_MAP[sender] || "groven"; // 기본값 groven
      var qty    = iQty !== -1 ? toNum(row[iQty]) : null;
      var grade  = parseGrade(itemName);
      var packs  = parsePacks(itemName) || qty;

      items.push({
        date:     fileDate,
        vendor:   "푸드엔드베스트",
        item:     itemName,
        grade:    grade,
        qty:      packs,
        store:    store,
        note:     iNote !== -1 ? String(row[iNote] || "") : "",
        srcFile:  filename,
      });
    });
  });

  return items;
}

// 정산서(거래내역서)에서 실제 수량·금액 파싱
// 반환: { groven: [...], yb: [...] }
function parseFoodJungsan(fileId) {
  var ss = openAsSpreadsheet(fileId);
  var filename = DriveApp.getFileById(fileId).getName();
  var result = { groven: [], yb: [] };

  ss.getSheets().forEach(function(sheet) {
    var sheetName = sheet.getName().trim().toLowerCase();

    // 시트명으로 스토어 구분
    var storeKey = null;
    if (sheetName.indexOf("그로") !== -1 || sheetName === "groven") {
      storeKey = "groven";
    } else if (sheetName.indexOf("yb") !== -1 || sheetName.indexOf("옐") !== -1 || sheetName.indexOf("yellow") !== -1) {
      storeKey = "yb";
    }
    if (!storeKey) return;

    var data = sheet.getDataRange().getValues();

    // 헤더 행 탐색 (날짜·수량·단가·공급가 등 3개 이상 키워드 포함 행)
    var headerRow = -1;
    var keywords = ["날짜", "품목", "수량", "단가", "공급가", "합계", "규격"];
    for (var i = 0; i < Math.min(10, data.length); i++) {
      var score = 0;
      data[i].forEach(function(cell) {
        var s = String(cell).trim();
        keywords.forEach(function(kw) { if (s.indexOf(kw) !== -1) score++; });
      });
      if (score >= 3) { headerRow = i; break; }
    }
    if (headerRow === -1) return;

    var h   = data[headerRow];
    var iDate  = colIdxAny(h, ["날짜", "일자", "date"]);
    var iItem  = colIdxAny(h, ["품목", "상품명", "item"]);
    var iGrade = colIdxAny(h, ["규격", "등급", "사이즈"]);
    var iQty   = colIdxAny(h, ["수량", "qty"]);
    var iPrice = colIdxAny(h, ["단가", "price"]);
    var iSupply= colIdxAny(h, ["공급가", "공급액"]);
    var iTax   = colIdxAny(h, ["부가세", "vat", "세액"]);
    var iTotal = colIdxAny(h, ["합계", "금액", "total"]);
    var iNote  = colIdxAny(h, ["비고", "메모"]);

    for (var r = headerRow + 1; r < data.length; r++) {
      var row = data[r];
      var supply = iSupply !== -1 ? toNum(row[iSupply]) : 0;
      var total  = iTotal  !== -1 ? toNum(row[iTotal])  : 0;
      if (supply === 0 && total === 0) continue; // 빈 행

      var itemName = iItem  !== -1 ? String(row[iItem]  || "").trim() : "";
      var grade    = iGrade !== -1 ? String(row[iGrade] || "").trim() : parseGrade(itemName);
      var rawDate  = iDate  !== -1 ? row[iDate] : "";

      result[storeKey].push({
        date:    fmtDate(rawDate),
        vendor:  "푸드엔드베스트",
        item:    itemName || grade,
        grade:   grade || parseGrade(itemName),
        qty:     iQty   !== -1 ? toNum(row[iQty])   : null,
        price:   iPrice !== -1 ? toNum(row[iPrice])  : 0,
        supply:  supply,
        tax:     iTax   !== -1 ? toNum(row[iTax])    : 0,
        total:   total  || supply,
        store:   storeKey,
        note:    iNote  !== -1 ? String(row[iNote] || "") : "",
        srcFile: filename,
      });
    }
  });

  return result;
}

// 발주↔정산 대조
// baljooItems: parseFoodBaljoo() 반환 배열
// jungsanItems: parseFoodJungsan() 반환 { groven, yb }
// 반환: 대조 결과 행 배열 (OUTPUT_HEADERS 형식)
function compareFoodItems(baljooItems, jungsanByStore) {
  var rows = [];

  ["groven", "yb"].forEach(function(storeKey) {
    var storeName = storeKey === "groven" ? "그로븐" : "옐로우브릿지";
    var jItems = jungsanByStore[storeKey] || [];

    // 정산서 → 규격별 집계 (같은 규격이 여러 행인 경우 합산)
    var jMap = {}; // key: grade
    jItems.forEach(function(ji) {
      var k = ji.grade || ji.item;
      if (!jMap[k]) jMap[k] = { qty: 0, supply: 0, tax: 0, total: 0, price: ji.price, items: [] };
      jMap[k].qty    += ji.qty || 0;
      jMap[k].supply += ji.supply;
      jMap[k].tax    += ji.tax;
      jMap[k].total  += ji.total;
      jMap[k].items.push(ji);
    });

    // 발주서 항목 중 해당 스토어 것만
    var bItems = baljooItems.filter(function(b) { return b.store === storeKey; });

    // 발주서 → 규격별 집계
    var bMap = {};
    bItems.forEach(function(bi) {
      var k = bi.grade || bi.item;
      if (!bMap[k]) bMap[k] = { qty: 0, items: [] };
      bMap[k].qty += bi.qty || 0;
      bMap[k].items.push(bi);
    });

    // 정산서 기준으로 대조 행 생성
    Object.keys(jMap).forEach(function(grade) {
      var j = jMap[grade];
      var b = bMap[grade];

      var bQty  = b ? b.qty  : null;
      var diff  = (bQty !== null) ? (j.qty - bQty) : null;
      var flag  = "";
      if (diff === null)      flag = DO_COMPARE ? "⚠️ 발주서없음" : "정산기준";
      else if (diff !== 0)    flag = "🔴 수량불일치(발주" + bQty + "→정산" + j.qty + ")";
      else                    flag = "✅";

      // 정산서 첫 번째 항목의 날짜 사용
      var date = j.items[0] ? j.items[0].date : "";

      rows.push([
        date,                      // 날짜
        "푸드엔드베스트",           // 거래처
        "매입",                    // 분류
        grade,                     // 품목
        grade,                     // 규격
        j.qty,                     // 수량
        j.price,                   // 단가
        j.supply,                  // 공급가
        j.tax,                     // 부가세
        j.total,                   // 합계
        storeKey,                  // 스토어
        "",                        // 메모
        flag,                      // 대조결과
        j.items[0] ? j.items[0].srcFile : "", // 원본파일
        j.items.length,            // 건수 (정산서 주문 수)
      ]);
    });

    // 발주서에만 있고 정산서에 없는 항목 → 경고
    Object.keys(bMap).forEach(function(grade) {
      if (!jMap[grade]) {
        var b = bMap[grade];
        rows.push([
          b.items[0] ? b.items[0].date : "",
          "푸드엔드베스트",
          "매입",
          grade, grade,
          b.qty, 0, 0, 0, 0,
          storeKey, "",
          "⚠️ 정산서없음(발주만존재)",
          b.items[0] ? b.items[0].srcFile : "",
          b.items.length,
        ]);
      }
    });
  });

  return rows;
}

// 한 달치 처리 메인
// yearMonth: "2605"
// 반환: { purchaseRows, compareRows }
function processFoodAndBest(yearMonth) {
  log("[푸드엔드베스트] 처리 시작: " + yearMonth);

  // 발주서 파일 목록 (대조 모드일 때만 — 발주서가 많아 느림)
  var baljooFiles = DO_COMPARE ? listFilesInFolder(CONFIG.FOLDER.BALJOO_FOOD, yearMonth) : [];
  log("  발주서 파일: " + baljooFiles.length + "개" + (DO_COMPARE ? "" : " (대조 생략)"));

  // 정산서 파일 목록
  var jungsanFiles = listFilesInFolder(CONFIG.FOLDER.FOOD_JUNGSAN, yearMonth);
  log("  정산서 파일: " + jungsanFiles.length + "개");

  var allBaljoo = [];
  baljooFiles.forEach(function(f) {
    try {
      var items = parseFoodBaljoo(f.id);
      allBaljoo = allBaljoo.concat(items);
      log("  발주 " + f.name + ": " + items.length + "건");
    } catch(e) { log("  ⚠️ 발주서 파싱 오류 " + f.name + ": " + e.message); }
  });

  var allJungsan = { groven: [], yb: [] };
  jungsanFiles.forEach(function(f) {
    try {
      var r = parseFoodJungsan(f.id);
      allJungsan.groven = allJungsan.groven.concat(r.groven);
      allJungsan.yb     = allJungsan.yb.concat(r.yb);
      log("  정산 " + f.name + ": 그로븐 " + r.groven.length + "건 / YB " + r.yb.length + "건");
    } catch(e) { log("  ⚠️ 정산서 파싱 오류 " + f.name + ": " + e.message); }
  });

  var compareRows  = compareFoodItems(allBaljoo, allJungsan);
  var purchaseRows = compareRows; // 대조 결과 = 매입내역

  log("[푸드엔드베스트] 완료: 매입 " + purchaseRows.length + "건");
  return { purchaseRows: purchaseRows, compareRows: compareRows };
}
