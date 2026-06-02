// ===== 공통 유틸리티 =====

// 숫자 변환 (쉼표·원화 기호 제거)
function toNum(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  return parseFloat(String(v).replace(/[₩,\s]/g, "")) || 0;
}

// 날짜 객체 → "YYYY-MM-DD"
function fmtDate(d) {
  if (!d) return "";
  if (typeof d === "string") return d.substring(0, 10);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

// 파일명에서 YYMMDD 추출 → "YYYY-MM-DD" 변환
// 예: "260515-푸드엔드베스트" → "2026-05-15"
function dateFromFilename(name) {
  var m = name.match(/^(\d{2})(\d{2})(\d{2})/);
  if (!m) return "";
  var y = 2000 + parseInt(m[1]);
  return y + "-" + m[2] + "-" + m[3];
}

// 연·월 필터 (YYMMDD 파일명 기준)
// targetYM: "2605" 또는 { year:2026, month:5 }
function matchYearMonth(filename, targetYM) {
  var ym = typeof targetYM === "string" ? targetYM :
    String(targetYM.year).slice(2) + String(targetYM.month).padStart(2, "0");
  return filename.indexOf(ym) === 0;
}

// 스프레드시트 → 2D 배열 (첫 행 = 헤더, 이후 = 데이터)
function sheetToRows(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { headers: data[0] || [], rows: [] };
  return { headers: data[0], rows: data.slice(1) };
}

// 헤더 배열에서 키워드가 포함된 열 인덱스 반환 (-1 = 없음)
function colIdx(headers, keyword) {
  keyword = keyword.toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase().indexOf(keyword) !== -1) return i;
  }
  return -1;
}

// 여러 키워드 중 처음 매칭되는 열
function colIdxAny(headers, keywords) {
  for (var k = 0; k < keywords.length; k++) {
    var idx = colIdx(headers, keywords[k]);
    if (idx !== -1) return idx;
  }
  return -1;
}

// 스프레드시트(엑셀/구글시트)로 읽을 수 있는 파일인지 확인
// PNG/JPG/PDF 등 그림·문서 파일은 제외
function isSpreadsheetFile(name, mimeType) {
  var SHEET_MIMES = [
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
    "application/vnd.ms-excel", // xls
  ];
  if (SHEET_MIMES.indexOf(mimeType) !== -1) return true;
  // mimeType이 비어있을 때 확장자로 보조 판단
  return /\.(xlsx|xls|csv)$/i.test(name);
}

// 드라이브 폴더에서 YYMMDD 패턴 파일 목록 수집 (엑셀/구글시트만)
// yearMonth: "2605" 형태 (비워두면 전체)
function listFilesInFolder(folderId, yearMonth) {
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  var result = [];
  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    if (yearMonth && !matchYearMonth(name, yearMonth)) continue;
    if (/회신/.test(name)) continue; // 발주 '회신' 파일 제외 (대조용 발주서만 사용)
    if (!isSpreadsheetFile(name, f.getMimeType())) continue; // 그림·PDF 제외
    result.push({ id: f.getId(), name: name, file: f });
  }
  // 날짜 오름차순 정렬
  result.sort(function(a, b) { return a.name > b.name ? 1 : -1; });
  return result;
}

// 변환으로 생긴 임시 파일 ID 보관 (실행 끝에 정리)
var _tempFileIds = [];

// 스프레드시트 열기 (xlsx 포함, Google Sheets 모두)
function openAsSpreadsheet(fileId) {
  try {
    return SpreadsheetApp.openById(fileId);
  } catch (e) {
    // xlsx 파일은 Google Sheets로 변환 후 열기 (Drive API v3)
    var blob = DriveApp.getFileById(fileId).getBlob();
    var converted = Drive.Files.create(
      { name: "tmp_" + fileId, mimeType: "application/vnd.google-apps.spreadsheet" },
      blob
    );
    _tempFileIds.push(converted.id);
    return SpreadsheetApp.openById(converted.id);
  }
}

// 변환용 임시 파일 정리
function cleanupTempFiles() {
  _tempFileIds.forEach(function(id) {
    try { DriveApp.getFileById(id).setTrashed(true); } catch(e) {}
  });
  _tempFileIds = [];
}

// 출력 스프레드시트 가져오기 또는 생성
function getOrCreateOutputSheet() {
  if (CONFIG.OUTPUT_SHEET_ID) {
    try { return SpreadsheetApp.openById(CONFIG.OUTPUT_SHEET_ID); } catch(e) {}
  }
  var ss = SpreadsheetApp.create("매입·매출 마감 자동화 결과");
  Logger.log("새 출력 시트 생성: " + ss.getId());
  // Config에 저장 안내
  Logger.log("CONFIG.OUTPUT_SHEET_ID 에 아래 ID를 입력하세요: " + ss.getId());
  return ss;
}

// 시트 초기화 (헤더 세팅)
function resetSheet(ss, sheetName, headers) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);
  else sh.clearContents();
  if (headers && headers.length) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight("bold").setBackground("#eef1f6");
    sh.setFrozenRows(1);
  }
  return sh;
}

// 행 배열 추가
function appendRows(sheet, rows) {
  if (!rows || !rows.length) return;
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
}

// 금액 열에 통화 형식 적용
function formatCurrencyCols(sheet, colIndices, startRow, endRow) {
  colIndices.forEach(function(c) {
    sheet.getRange(startRow, c + 1, endRow - startRow + 1, 1)
      .setNumberFormat("#,##0");
  });
}

// 로그 기록
var _logs = [];
function log(msg) {
  Logger.log(msg);
  _logs.push([new Date(), msg]);
}
function flushLog(ss) {
  var sh = resetSheet(ss, CONFIG.SHEET_LOG, ["시각", "내용"]);
  if (_logs.length) appendRows(sh, _logs);
}

// 품목명에서 규격(100g/140g 등) 파싱
function parseGrade(name) {
  var m = String(name).match(/(\d+)\s*g/i);
  return m ? m[1] + "g" : "";
}

// 품목명에서 팩 수 파싱 ("10팩", "5팩" 등)
function parsePacks(name) {
  var m = String(name).match(/(\d+)\s*팩/);
  return m ? parseInt(m[1]) : null;
}
