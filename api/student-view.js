// api/student-view.js
// GET /api/student-view?studentId=12345&grade=ป.3&room=1
// -> ตรวจสอบตัวตนนักเรียน (id+grade ต้องตรงกัน) แล้วคืนรายการชิ้นงานของนักเรียนคนนี้
//    พร้อมสถานะส่ง/คะแนน (รวมข้อมูล Assignments meta + ชีตรายวิชาให้แล้ว)

const { getAssignmentsMetaSheet, getStudentsSheet, getOrCreateSubjectSheet } = require('./_lib/sheets');

function parseCellValue(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { status: 'pending', score: null };
  }
  const n = Number(rawValue);
  if (!Number.isNaN(n)) return { status: 'done', score: n };
  return { status: 'done', score: null };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { studentId, grade } = req.query;
    if (!studentId || !grade) {
      return res.status(400).json({ error: 'ต้องระบุ studentId และ grade' });
    }

    const studentsSheet = await getStudentsSheet();
    const studentRow = (await studentsSheet.getRows()).find(
      (r) => r.get('id') === String(studentId) && r.get('grade') === String(grade)
    );
    if (!studentRow) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลนักเรียน กรุณาตรวจสอบรหัสและระดับชั้นอีกครั้ง' });
    }

    const student = {
      id: studentRow.get('id'),
      prefix: studentRow.get('prefix'),
      firstName: studentRow.get('firstName'),
      lastName: studentRow.get('lastName'),
      grade: studentRow.get('grade'),
      room: studentRow.get('room'),
      no: studentRow.get('no'),
    };

    const metaSheet = await getAssignmentsMetaSheet();
    const allAssignments = (await metaSheet.getRows()).map((r) => ({
      id: r.get('id'),
      subject: r.get('subject'),
      title: r.get('title'),
      grade: r.get('grade'),
      room: r.get('room'),
      dueDate: r.get('dueDate'),
      maxScore: r.get('maxScore') ? Number(r.get('maxScore')) : null,
      detail: r.get('detail'),
    }));

    const myAssignments = allAssignments.filter(
      (a) => a.grade === student.grade
        && (a.room === 'ทั้งหมด' || String(a.room).split(',').includes(student.room))
    );

    // เปิดชีตรายวิชาที่เกี่ยวข้องแค่ครั้งเดียวต่อวิชา (กันเปิดซ้ำ)
    const subjectSheetCache = {};
    const assignments = [];
    for (const a of myAssignments) {
      if (!subjectSheetCache[a.subject]) {
        const sheet = await getOrCreateSubjectSheet(a.subject);
        subjectSheetCache[a.subject] = await sheet.getRows();
      }
      const rows = subjectSheetCache[a.subject];
      const row = rows.find((r) => r.get('รหัสนักเรียน') === student.id);
      const rawValue = row ? row.get(a.title) : undefined;
      const { status, score } = parseCellValue(rawValue);
      assignments.push({ ...a, status, score });
    }

    return res.status(200).json({ student, assignments });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};
