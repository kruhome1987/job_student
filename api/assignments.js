// api/assignments.js
// GET    /api/assignments          -> คืนรายการชิ้นงานทั้งหมด (จากชีต Assignments)
// POST   /api/assignments          -> สร้างชิ้นงานใหม่ + เพิ่มคอลัมน์ในชีตรายวิชาอัตโนมัติ
// PUT    /api/assignments?id=xxx   -> แก้ไขชิ้นงาน (เปลี่ยนชื่อคอลัมน์ในชีตรายวิชาถ้าชื่องานเปลี่ยน)
// DELETE /api/assignments?id=xxx   -> ลบชิ้นงาน + ลบคอลัมน์ในชีตรายวิชา

const { randomUUID } = require('crypto');
const {
  getAssignmentsMetaSheet,
  appendAssignmentColumn,
  renameAssignmentColumn,
  deleteAssignmentColumn,
} = require('./_lib/sheets');

function rowToAssignment(r) {
  return {
    id: r.get('id'),
    subject: r.get('subject'),
    title: r.get('title'),
    grade: r.get('grade'),
    room: r.get('room'),
    dueDate: r.get('dueDate'),
    maxScore: r.get('maxScore') ? Number(r.get('maxScore')) : null,
    detail: r.get('detail'),
    created: r.get('created'),
  };
}

module.exports = async function handler(req, res) {
  try {
    const sheet = await getAssignmentsMetaSheet();

    if (req.method === 'GET') {
      const rows = await sheet.getRows();
      return res.status(200).json({ assignments: rows.map(rowToAssignment) });
    }

    if (req.method === 'POST') {
      const { subject, title, grade, room, dueDate, maxScore, detail } = req.body || {};
      if (!subject || !title || !grade || !room || !dueDate) {
        return res.status(400).json({ error: 'กรุณาระบุ subject, title, grade, room, dueDate ให้ครบ' });
      }

      const id = randomUUID();
      const created = new Date().toISOString();

      await sheet.addRow({
        id,
        subject,
        title,
        grade,
        room,
        dueDate,
        maxScore: maxScore || '',
        detail: detail || '',
        created,
      });

      // สร้างชีตรายวิชา (ถ้ายังไม่มี) และเพิ่มคอลัมน์ชิ้นงานใหม่ทางขวาสุด
      await appendAssignmentColumn(subject, title);

      return res.status(201).json({
        assignment: { id, subject, title, grade, room, dueDate, maxScore: maxScore || null, detail: detail || '', created },
      });
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ต้องระบุ id' });

      const rows = await sheet.getRows();
      const row = rows.find((r) => r.get('id') === String(id));
      if (!row) return res.status(404).json({ error: 'ไม่พบชิ้นงานนี้' });

      const oldSubject = row.get('subject');
      const oldTitle = row.get('title');

      const { subject, title, grade, room, dueDate, maxScore, detail } = req.body || {};

      row.set('subject', subject);
      row.set('title', title);
      row.set('grade', grade);
      row.set('room', room);
      row.set('dueDate', dueDate);
      row.set('maxScore', maxScore || '');
      row.set('detail', detail || '');
      await row.save();

      // ถ้าเปลี่ยนชื่องาน (แต่วิชาเดิม) -> เปลี่ยนชื่อคอลัมน์ในชีตรายวิชา
      if (subject === oldSubject && title !== oldTitle) {
        await renameAssignmentColumn(subject, oldTitle, title);
      }
      // ถ้าเปลี่ยนวิชา -> ลบคอลัมน์เก่า และสร้างคอลัมน์ใหม่ในวิชาใหม่ (ข้อมูลคะแนนเดิมจะไม่ถูกย้ายตาม)
      if (subject !== oldSubject) {
        await deleteAssignmentColumn(oldSubject, oldTitle);
        await appendAssignmentColumn(subject, title);
      }

      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ต้องระบุ id' });

      const rows = await sheet.getRows();
      const row = rows.find((r) => r.get('id') === String(id));
      if (!row) return res.status(404).json({ error: 'ไม่พบชิ้นงานนี้' });

      const subject = row.get('subject');
      const title = row.get('title');

      await row.delete();
      await deleteAssignmentColumn(subject, title);

      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};
