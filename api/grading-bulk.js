// api/grading-bulk.js
// POST /api/grading-bulk   body: { assignmentId, forceScore }
// -> ถ้าระบุ forceScore: จะบันทึกคะแนนที่ระบุให้ทุกคน (ทับข้อมูลเดิม)
// -> ถ้าไม่ระบุ forceScore: ตั้งสถานะ "ส่งแล้ว" ให้คนที่ยังไม่ส่ง (ถืองานเก็บคะแนน จะให้คะแนนเต็มอัตโนมัติ)

const {
  getAssignmentsMetaSheet,
  getStudentsSheet,
  getOrCreateSubjectSheet,
  findOrCreateStudentRow,
} = require('./_lib/sheets');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { assignmentId, forceScore } = req.body || {};
    if (!assignmentId) return res.status(400).json({ error: 'ต้องระบุ assignmentId' });

    const metaSheet = await getAssignmentsMetaSheet();
    const metaRow = (await metaSheet.getRows()).find((r) => r.get('id') === String(assignmentId));
    if (!metaRow) return res.status(404).json({ error: 'ไม่พบชิ้นงานนี้' });

    const assignment = {
      subject: metaRow.get('subject'),
      title: metaRow.get('title'),
      grade: metaRow.get('grade'),
      room: metaRow.get('room'),
      maxScore: metaRow.get('maxScore') ? Number(metaRow.get('maxScore')) : null,
    };

    const studentsSheet = await getStudentsSheet();
    const allStudents = (await studentsSheet.getRows()).map((r) => ({
      id: r.get('id'),
      prefix: r.get('prefix'),
      firstName: r.get('firstName'),
      lastName: r.get('lastName'),
      grade: r.get('grade'),
      room: r.get('room'),
    }));

    const targetStudents = allStudents.filter(
      (s) => s.grade === assignment.grade
        && (assignment.room === 'ทั้งหมด' || String(assignment.room).split(',').includes(s.room))
    );

    const subjectSheet = await getOrCreateSubjectSheet(assignment.subject);

    for (const stu of targetStudents) {
      const row = await findOrCreateStudentRow(subjectSheet, stu);
      const existingValue = row.get(assignment.title);
      
      // โลจิกใหม่: ถ้ามีการส่งคะแนนมา (ปุ่มให้คะแนนทุกคน)
      if (forceScore !== undefined && forceScore !== null) {
          row.set(assignment.title, String(forceScore));
          await row.save();
      } 
      // โลจิกเดิม: กดปุ่มเช็คส่งทุกคน (ให้เฉพาะคนที่ยังว่าง)
      else if (!existingValue) {
          let newValue = assignment.maxScore ? String(assignment.maxScore) : 'ส่งแล้ว';
          row.set(assignment.title, newValue);
          await row.save();
      }
    }

    return res.status(200).json({ ok: true, updated: targetStudents.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};