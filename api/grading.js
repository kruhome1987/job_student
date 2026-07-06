// api/grading.js
// GET  /api/grading?assignmentId=xxx
//      -> คืนข้อมูลชิ้นงาน + รายชื่อนักเรียนเป้าหมายพร้อมสถานะ/คะแนนปัจจุบัน
// POST /api/grading   body: { assignmentId, studentId, status, score }
//      -> บันทึกสถานะ/คะแนนของนักเรียน 1 คน ลงคอลัมน์ในชีตรายวิชา

const {
  getAssignmentsMetaSheet,
  getStudentsSheet,
  getOrCreateSubjectSheet,
  findOrCreateStudentRow,
} = require('./_lib/sheets');

async function loadAssignmentMeta(assignmentId) {
  const metaSheet = await getAssignmentsMetaSheet();
  const rows = await metaSheet.getRows();
  const row = rows.find((r) => r.get('id') === String(assignmentId));
  if (!row) return null;
  return {
    id: row.get('id'),
    subject: row.get('subject'),
    title: row.get('title'),
    grade: row.get('grade'),
    room: row.get('room'),
    dueDate: row.get('dueDate'),
    maxScore: row.get('maxScore') ? Number(row.get('maxScore')) : null,
    detail: row.get('detail'),
  };
}

// ตัดสินสถานะ/คะแนนจากค่าที่เก็บในเซลล์ของชีตรายวิชา
function parseCellValue(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { status: 'pending', score: null };
  }
  const n = Number(rawValue);
  if (!Number.isNaN(n)) {
    return { status: 'done', score: n };
  }
  return { status: 'done', score: null };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { assignmentId } = req.query;
      if (!assignmentId) return res.status(400).json({ error: 'ต้องระบุ assignmentId' });

      const assignment = await loadAssignmentMeta(assignmentId);
      if (!assignment) return res.status(404).json({ error: 'ไม่พบชิ้นงานนี้' });

      const studentsSheet = await getStudentsSheet();
      const allStudents = (await studentsSheet.getRows()).map((r) => ({
        id: r.get('id'),
        prefix: r.get('prefix'),
        firstName: r.get('firstName'),
        lastName: r.get('lastName'),
        grade: r.get('grade'),
        room: r.get('room'),
        no: r.get('no'),
      }));

      const targetStudents = allStudents.filter(
        (s) => s.grade === assignment.grade
          && (assignment.room === 'ทั้งหมด' || String(assignment.room).split(',').includes(s.room))
      );

      const subjectSheet = await getOrCreateSubjectSheet(assignment.subject);
      const subjectRows = await subjectSheet.getRows();

      const students = targetStudents.map((s) => {
        const subRow = subjectRows.find((r) => r.get('รหัสนักเรียน') === s.id);
        const rawValue = subRow ? subRow.get(assignment.title) : undefined;
        const { status, score } = parseCellValue(rawValue);
        return { ...s, status, score };
      });

      return res.status(200).json({ assignment, students });
    }

    if (req.method === 'POST') {
      const { assignmentId, studentId, status, score } = req.body || {};
      if (!assignmentId || !studentId) {
        return res.status(400).json({ error: 'ต้องระบุ assignmentId และ studentId' });
      }

      const assignment = await loadAssignmentMeta(assignmentId);
      if (!assignment) return res.status(404).json({ error: 'ไม่พบชิ้นงานนี้' });

      const studentsSheet = await getStudentsSheet();
      const studentRow = (await studentsSheet.getRows()).find((r) => r.get('id') === String(studentId));
      if (!studentRow) return res.status(404).json({ error: 'ไม่พบนักเรียนคนนี้' });

      const student = {
        id: studentRow.get('id'),
        prefix: studentRow.get('prefix'),
        firstName: studentRow.get('firstName'),
        lastName: studentRow.get('lastName'),
      };

      const subjectSheet = await getOrCreateSubjectSheet(assignment.subject);
      await subjectSheet.loadHeaderRow();
      if (!subjectSheet.headerValues.includes(assignment.title)) {
        const { appendAssignmentColumn } = require('./_lib/sheets');
        await appendAssignmentColumn(assignment.subject, assignment.title);
      }

      const row = await findOrCreateStudentRow(subjectSheet, student);

      // โลจิกใหม่สำหรับการบันทึกคะแนน
      let cellValue = '';
      if (status === 'done') {
        if (assignment.maxScore) {
            // กรณีเป็นงานเก็บคะแนน: ถ้าครูใส่คะแนนให้บันทึกตัวเลข ถ้าไม่ใส่(ว่างเปล่า) ให้ถือว่าเป็น 0 
            cellValue = (score !== null && score !== undefined && score !== '') ? String(score) : '0';
        } else {
            // กรณีเป็นงานไม่เก็บคะแนน: บันทึกข้อความลง Sheet 
            cellValue = 'ส่งแล้ว';
        }
      }
      
      row.set(assignment.title, cellValue);
      await row.save();

      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};
