// api/grading-bulk.js
// POST /api/grading-bulk   body: { assignmentId }
// -> ตั้งสถานะ "ส่งแล้ว" ให้นักเรียนเป้าหมายทุกคนของชิ้นงานนี้ (ไม่กระทบคะแนนเดิมที่มีอยู่)

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

    const { assignmentId } = req.body || {};
    if (!assignmentId) return res.status(400).json({ error: 'ต้องระบุ assignmentId' });

    const metaSheet = await getAssignmentsMetaSheet();
    const metaRow = (await metaSheet.getRows()).find((r) => r.get('id') === String(assignmentId));
    if (!metaRow) return res.status(404).json({ error: 'ไม่พบชิ้นงานนี้' });

    const assignment = {
      subject: metaRow.get('subject'),
      title: metaRow.get('title'),
      grade: metaRow.get('grade'),
      room: metaRow.get('room'),
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
      // ถ้ามีค่าอยู่แล้ว (มีคะแนน หรือทำเครื่องหมายส่งแล้ว) ให้คงค่าเดิมไว้ ไม่ทับ
      // ถ้ายังว่างอยู่ (ยังไม่ส่ง) ให้ทำเครื่องหมายว่า "ส่งแล้ว"
      if (!existingValue) {
        row.set(assignment.title, 'ส่งแล้ว');
        await row.save();
      }
    }

    return res.status(200).json({ ok: true, updated: targetStudents.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};
