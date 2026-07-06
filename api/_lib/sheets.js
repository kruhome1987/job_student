// api/_lib/sheets.js
// -----------------------------------------------------------------------------
// ตัวเชื่อมต่อ Google Sheets กลาง ใช้ร่วมกันทุก API
// ต้องตั้งค่า Environment Variables ใน Vercel ก่อนใช้งาน (ดู README.md):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL
//   GOOGLE_PRIVATE_KEY
//   GOOGLE_SHEET_ID
// -----------------------------------------------------------------------------

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const STUDENTS_SHEET = 'Students';
const ASSIGNMENTS_SHEET = 'Assignments';

const STUDENTS_HEADERS = ['id', 'prefix', 'firstName', 'lastName', 'grade', 'room', 'no'];
const ASSIGNMENTS_HEADERS = [
  'id', 'subject', 'title', 'grade', 'room', 'dueDate', 'maxScore', 'detail', 'created',
];

let cachedDoc = null;

/**
 * เปิดการเชื่อมต่อไปยัง Google Spreadsheet (มี cache ไว้ ไม่ต้อง auth ใหม่ทุกครั้ง)
 */
async function getDoc() {
  if (cachedDoc) return cachedDoc;

  const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID } = process.env;

  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
    throw new Error(
      'ยังไม่ได้ตั้งค่า Environment Variables ให้ครบ (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID)'
    );
  }

  const auth = new JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, auth);
  await doc.loadInfo();
  cachedDoc = doc;
  return doc;
}

/**
 * ดึงชีต "Students" ถ้ายังไม่มีให้สร้างใหม่พร้อม Header
 */
async function getStudentsSheet() {
  const doc = await getDoc();
  let sheet = doc.sheetsByTitle[STUDENTS_SHEET];
  if (!sheet) {
    sheet = await doc.addSheet({ title: STUDENTS_SHEET, headerValues: STUDENTS_HEADERS });
  } else {
    await sheet.loadHeaderRow().catch(() => sheet.setHeaderRow(STUDENTS_HEADERS));
  }
  return sheet;
}

/**
 * ดึงชีต "Assignments" (เมตาดาต้าของชิ้นงานทั้งหมด) ถ้ายังไม่มีให้สร้างใหม่
 */
async function getAssignmentsMetaSheet() {
  const doc = await getDoc();
  let sheet = doc.sheetsByTitle[ASSIGNMENTS_SHEET];
  if (!sheet) {
    sheet = await doc.addSheet({ title: ASSIGNMENTS_SHEET, headerValues: ASSIGNMENTS_HEADERS });
  } else {
    await sheet.loadHeaderRow().catch(() => sheet.setHeaderRow(ASSIGNMENTS_HEADERS));
  }
  return sheet;
}

/**
 * ดึงชีตของ "รายวิชา" (เช่น คณิตศาสตร์) ถ้ายังไม่มีให้สร้างใหม่
 * โครงสร้าง: รหัสนักเรียน | ชื่อ-สกุล | [ชื่องานที่ 1] | [ชื่องานที่ 2] | ...
 */
async function getOrCreateSubjectSheet(subject) {
  const doc = await getDoc();
  let sheet = doc.sheetsByTitle[subject];
  if (!sheet) {
    sheet = await doc.addSheet({ title: subject, headerValues: ['รหัสนักเรียน', 'ชื่อ-สกุล'] });
  }
  return sheet;
}

/**
 * เพิ่มคอลัมน์ชิ้นงานใหม่ทางขวาสุดของชีตรายวิชา (ถ้ายังไม่มีคอลัมน์นี้)
 */
async function appendAssignmentColumn(subject, columnTitle) {
  const sheet = await getOrCreateSubjectSheet(subject);
  await sheet.loadHeaderRow();
  const headers = sheet.headerValues || [];

  if (headers.includes(columnTitle)) return sheet; // มีคอลัมน์นี้อยู่แล้ว

  const newHeaders = [...headers, columnTitle];

  // ขยายจำนวนคอลัมน์ของชีตถ้าจำเป็น ก่อน setHeaderRow
  if (sheet.columnCount < newHeaders.length) {
    await sheet.resize({ rowCount: sheet.rowCount, columnCount: newHeaders.length });
  }
  await sheet.setHeaderRow(newHeaders);
  return sheet;
}

/**
 * เปลี่ยนชื่อคอลัมน์ชิ้นงาน (กรณีครูแก้ไขชื่องาน)
 */
async function renameAssignmentColumn(subject, oldTitle, newTitle) {
  const sheet = await getOrCreateSubjectSheet(subject);
  await sheet.loadHeaderRow();
  const headers = [...(sheet.headerValues || [])];
  const idx = headers.indexOf(oldTitle);
  if (idx === -1) return; // ไม่พบคอลัมน์เดิม ข้ามไป
  headers[idx] = newTitle;
  await sheet.setHeaderRow(headers);
}

/**
 * ลบคอลัมน์ชิ้นงานออกจากชีตรายวิชา
 * หมายเหตุ: ไลบรารี google-spreadsheet ยังไม่ implement sheet.deleteDimension() ให้ใช้งานจริง
 * (เป็นฟังก์ชันว่างเปล่าในตัวไลบรารี) จึงต้องเรียก batchUpdate ผ่าน _makeSingleUpdateRequest ตรงๆ แทน
 */
async function deleteAssignmentColumn(subject, title) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle[subject];
  if (!sheet) return;
  await sheet.loadHeaderRow();
  const headers = sheet.headerValues || [];
  const idx = headers.indexOf(title);
  if (idx === -1) return;

  await sheet._makeSingleUpdateRequest('deleteDimension', {
    range: {
      sheetId: sheet.sheetId,
      dimension: 'COLUMNS',
      startIndex: idx,
      endIndex: idx + 1,
    },
  });
}

/**
 * หาแถวของนักเรียนในชีตรายวิชา ถ้ายังไม่มีให้สร้างแถวใหม่
 */
async function findOrCreateStudentRow(subjectSheet, student) {
  const rows = await subjectSheet.getRows();
  let row = rows.find((r) => r.get('รหัสนักเรียน') === student.id);
  if (!row) {
    row = await subjectSheet.addRow({
      'รหัสนักเรียน': student.id,
      'ชื่อ-สกุล': `${student.prefix || ''}${student.firstName} ${student.lastName}`,
    });
  }
  return row;
}

module.exports = {
  getDoc,
  getStudentsSheet,
  getAssignmentsMetaSheet,
  getOrCreateSubjectSheet,
  appendAssignmentColumn,
  renameAssignmentColumn,
  deleteAssignmentColumn,
  findOrCreateStudentRow,
  STUDENTS_HEADERS,
  ASSIGNMENTS_HEADERS,
};
