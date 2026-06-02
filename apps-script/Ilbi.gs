// ===== 일비 파서 =====
// 발주서: 17EBW_keARXJ7ZADq7GjOKxQtQSbT78wR
// 정산서: 1CdexzQ1dPKTBnr_5oAX1KvOSrZBuX683
//
// 일비 정산서 구조 (정산상세내역 시트):
//   주문자명 기준 분리
//   - 현해랑 → B2B 매출 (그로븐에서 현해랑에게 판매)
//   - 로또상회 / YB / 자꾸가게 → 자사 매입
//
// 발주서 구조:
//   baljoo 앱 출력 형식 (품목명, 수량, 보내는분)

// 발주서 파싱 (baljoo 앱)
function parseIlbiBaljoo(fileId) {
  var ss = openAsSpreadsheet(fileId);
  var filename = DriveApp.getFileById(fileId).getName();
  var fileDate = dateFromFilename(filename);
  var items = [];

  ss.getSheets().forEach(function(sheet) {
    var d = sheetToRows(sheet);
    if (!d.rows.length) return;
    var h = d.headers;

    var iItem   = colIdxAny(h, ["품목명", "품목", "상품명"]);
    var iQty    = colIdxAny(h, ["수량", "qty"]);
    var iSender = colIdxAny(h, ["보내는분", "주문자", "발주처"]);
    var iNote   = colIdxAny(h, ["비고", "메모"]);

    if (iItem === -1) return;

    d.rows.forEach(function(row) {
      var itemName = String(row[iItem] || "").trim();
      if (!itemName) return;

      var sender = iSender !== -1 ? String(row[iSender] || "").trim() : "";
      var store  = CONFIG.STORE_MAP[sender] || "groven";

      items.push({
        date:    fileDate,
        vendor:  "일비",
        item:    itemName,
        grade:   parseGrade(itemName),
        qty:     iQty !== -1 ? toNum(row[iQty]) : null,
        store:   store,
        sender:  sender,
        note:    iNote !== -1 ? String(row[iNote] || "") : "",
        srcFile: filename,
      });
    });
  });

  return items;
}

// 정산서(정산상세내역 시트) 파싱
// 반환: { purchase: [...], b2bSales: [...] }
function parseIlbiJungsan(fileId) {
  var ss = openAsSpreadsheet(fileId);
  var filename = DriveApp.getFileById(fileId).getName();
  var result = { purchase: [], b2bSales: [] };

  ss.getSheets().forEach(function(sheet) {
    var sheetName = sheet.getName().trim();
    // "정산상세내역" 또는 "상세" 포함 시트 처리
    var isDetail = sheetName.indexOf("상세") !== -1 || sheetName.indexOf("정산") !== -1;
    // 시트 이름이 없어도 데이터가 있으면 처리 시도
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return;

    // 헤더 행 탐색
    var headerRow = -1;
    var keywords = ["주문자", "품목", "수량", "단가", "금액", "날짜", "공급가"];
    for (var i = 0; i < Math.min(10, data.length); i++) {
      var score = 0;
      data[i].forEach(function(cell) {
        var s = String(cell).trim();
        keywords.forEach(function(kw) { if (s.indexOf(kw) !== -1) score++; });
      });
      if (score >= 3) { headerRow = i; break; }
    }
    if (headerRow === -1) return;

    var h = data[headerRow];
    var iBuyer  = colIdxAny(h, ["주문자", "주문자명", "buyer", "수취인"]);
    var iDate   = colIdxAny(h, ["날짜", "일자", "date", "주문일"]);
    var iItem   = colIdxAny(h, ["품목", "상품명", "item", "제품"]);
    var iGrade  = colIdxAny(h, ["규격", "등급", "사이즈"]);
    var iQty    = colIdxAny(h, ["수량", "qty"]);
    var iPrice  = colIdxAny(h, ["단가", "price"]);
    var iSupply = colIdxAny(h, ["공급가", "공급액", "공급"]);
    var iTax    = colIdxAny(h, ["부가세", "vat", "세액"]);
    var iTotal  = colIdxAny(h, ["합계", "금액", "total"]);
    var iNote   = colIdxAny(h, ["비고", "메모"]);

    for (var r = headerRow + 1; r < data.length; r++) {
      var row = data[r];
      var supply = iSupply !== -1 ? toNum(row[iSupply]) : 0;
      var total  = iTotal  !== -1 ? toNum(row[iTotal])  : 0;
      if (supply === 0 && total === 0) continue;

      var buyer    = iBuyer  !== -1 ? String(row[iBuyer]  || "").trim() : "";
      var itemName = iItem   !== -1 ? String(row[iItem]   || "").trim() : "";
      var grade    = iGrade  !== -1 ? String(row[iGrade]  || "").trim() : parseGrade(itemName);
      var rawDate  = iDate   !== -1 ? row[iDate] : "";

      var isB2B = CONFIG.ILBI_B2B_BUYER.some(function(name) {
        return buyer.indexOf(name) !== -1;
      });

      // 스토어 결정 (구매자명 기반)
      var store = CONFIG.STORE_MAP[buyer] || "groven";
      if (isB2B) store = "groven"; // B2B 매출은 그로븐

      var entry = {
        date:    fmtDate(rawDate),
        vendor:  "일비",
        buyer:   buyer,
        item:    itemName || grade,
        grade:   grade || parseGrade(itemName),
        qty:     iQty   !== -1 ? toNum(row[iQty])   : null,
        price:   iPrice !== -1 ? toNum(row[iPrice])  : 0,
        supply:  supply,
        tax:     iTax   !== -1 ? toNum(row[iTax])    : 0,
        total:   total  || supply,
        store:   store,
        note:    iNote  !== -1 ? String(row[iNote] || "") : "",
        srcFile: filename,
        isB2B:   isB2B,
      };

      if (isB2B) {
        result.b2bSales.push(entry);
      } else {
        result.purchase.push(entry);
      }
    }
  });

  return result;
}

// 발주↔정산 대조 (일비)
function compareIlbiItems(baljooItems, jungsanPurchase) {
  var rows = [];

  // 발주서 → 품목+스토어 기준 집계
  var bMap = {};
  baljooItems.forEach(function(bi) {
    var k = bi.item + "|" + bi.store;
    if (!bMap[k]) bMap[k] = { qty: 0, items: [] };
    bMap[k].qty += bi.qty || 0;
    bMap[k].items.push(bi);
  });

  // 정산서 → 품목+스토어 기준 집계
  var jMap = {};
  jungsanPurchase.forEach(function(ji) {
    var k = (ji.item || ji.grade) + "|" + ji.store;
    if (!jMap[k]) jMap[k] = { qty: 0, supply: 0, tax: 0, total: 0, price: ji.price, items: [] };
    jMap[k].qty    += ji.qty || 0;
    jMap[k].supply += ji.supply;
    jMap[k].tax    += ji.tax;
    jMap[k].total  += ji.total;
    jMap[k].items.push(ji);
  });

  // 정산서 기준 행 생성
  Object.keys(jMap).forEach(function(key) {
    var parts = key.split("|");
    var itemKey = parts[0], storeKey = parts[1];
    var j = jMap[key];
    var b = bMap[key];

    var bQty = b ? b.qty : null;
    var diff = (bQty !== null) ? (j.qty - bQty) : null;
    var flag = "";
    if (diff === null)   flag = "⚠️ 발주서없음";
    else if (diff !== 0) flag = "🔴 수량불일치(발주" + bQty + "→정산" + j.qty + ")";
    else                 flag = "✅";

    var date = j.items[0] ? j.items[0].date : "";
    rows.push([
      date, "일비", "매입",
      itemKey, j.items[0] ? j.items[0].grade : "",
      j.qty, j.price, j.supply, j.tax, j.total,
      storeKey, "",
      flag,
      j.items[0] ? j.items[0].srcFile : "",
    ]);
  });

  // 발주서만 있는 항목
  Object.keys(bMap).forEach(function(key) {
    if (!jMap[key]) {
      var parts = key.split("|");
      var b = bMap[key];
      rows.push([
        b.items[0] ? b.items[0].date : "",
        "일비", "매입",
        parts[0], "",
        b.qty, 0, 0, 0, 0,
        parts[1], "",
        "⚠️ 정산서없음(발주만존재)",
        b.items[0] ? b.items[0].srcFile : "",
      ]);
    }
  });

  return rows;
}

// B2B 매출 행 변환
function ilbiB2bToSalesRows(b2bItems) {
  return b2bItems.map(function(item) {
    return [
      item.date,
      item.buyer,        // 채널/거래처 = 현해랑
      "B2B",             // 분류
      item.item,
      item.grade,
      item.qty,
      item.price,
      item.supply,
      item.tax,
      item.total,
      item.store,        // groven
      item.note,
      "✅",
      item.srcFile,
    ];
  });
}

// 한 달치 처리 메인
function processIlbi(yearMonth) {
  log("[일비] 처리 시작: " + yearMonth);

  var baljooFiles  = listFilesInFolder(CONFIG.FOLDER.BALJOO_ILBI, yearMonth);
  var jungsanFiles = listFilesInFolder(CONFIG.FOLDER.ILBI_JUNGSAN, yearMonth);
  log("  발주서: " + baljooFiles.length + "개 / 정산서: " + jungsanFiles.length + "개");

  var allBaljoo  = [];
  baljooFiles.forEach(function(f) {
    try {
      var items = parseIlbiBaljoo(f.id);
      allBaljoo = allBaljoo.concat(items);
      log("  발주 " + f.name + ": " + items.length + "건");
    } catch(e) { log("  ⚠️ 발주서 오류 " + f.name + ": " + e.message); }
  });

  var allPurchase = [], allB2b = [];
  jungsanFiles.forEach(function(f) {
    try {
      var r = parseIlbiJungsan(f.id);
      allPurchase = allPurchase.concat(r.purchase);
      allB2b      = allB2b.concat(r.b2bSales);
      log("  정산 " + f.name + ": 매입 " + r.purchase.length + "건 / B2B매출 " + r.b2bSales.length + "건");
    } catch(e) { log("  ⚠️ 정산서 오류 " + f.name + ": " + e.message); }
  });

  var compareRows  = compareIlbiItems(allBaljoo, allPurchase);
  var b2bSalesRows = ilbiB2bToSalesRows(allB2b);

  log("[일비] 완료: 매입 " + compareRows.length + "건 / B2B매출 " + b2bSalesRows.length + "건");
  return { purchaseRows: compareRows, b2bSalesRows: b2bSalesRows, compareRows: compareRows };
}
