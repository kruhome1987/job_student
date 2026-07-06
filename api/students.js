// api/students.js
// GET    /api/students             -> คืนรายชื่อนักเรียนทั้งหมด
// POST   /api/students             -> นำเข้า/อัปเดตนักเรียน (body: { students: [...] })
// DELETE /api/students?id=12345    -> ลบนักเรียน 1 คน

const { getStudentsSheet } = require('./_lib/sheets');

module.exports = async function handler(req, res) {
  try {
    const sheet = await getStudentsSheet();

    if (req.method === 'GET') {
      const rows = await sheet.getRows();
      const students = rows.map((r) => ({
        id: r.get('id'),
        prefix: r.get('prefix'),
        firstName: r.get('firstName'),
        lastName: r.get('lastName'),
        grade: r.get('grade'),
        room: r.get('room'),
        no: r.get('no'),
      }));
      return res.status(200).json({ students });
    }

    if (req.method === 'POST') {
      const { students } = req.body || {};
      if (!Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: 'ต้องส่ง students เป็น array และมีอย่างน้อย 1 รายการ' });
      }

      const rows = await sheet.getRows();
      let imported = 0;

      for (const stu of students) {
        if (!stu.id || !stu.firstName) continue;
        const existing = rows.find((r) => r.get('id') === String(stu.id));
        if (existing) {
          existing.set('prefix', stu.prefix || '');
          existing.set('firstName', stu.firstName);
          existing.set('lastName', stu.lastName || '');
          existing.set('grade', stu.grade || '');
          existing.set('room', stu.room || '');
          existing.set('no', stu.no || '');
          await existing.save();
        } else {
          await sheet.addRow({
            id: String(stu.id),
            prefix: stu.prefix || '',
            firstName: stu.firstName,
            lastName: stu.lastName || '',
            grade: stu.grade || '',
            room: stu.room || '',
            no: stu.no || '',
          });
        }
        imported += 1;
      }

      return res.status(200).json({ ok: true, imported });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ต้องระบุ id' });

      const rows = await sheet.getRows();
      const row = rows.find((r) => r.get('id') === String(id));
      if (!row) return res.status(404).json({ error: 'ไม่พบนักเรียนคนนี้' });

      await row.delete();
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
};
