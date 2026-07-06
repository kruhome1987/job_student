// ไฟล์นี้ทำหน้าที่เป็นตัวกลาง (Proxy) ระหว่าง Frontend บน Vercel และ Google Apps Script
// ช่วยแก้ปัญหา CORS และซ่อน URL ของ Apps Script เอาไว้ฝั่ง Backend เพื่อความปลอดภัย

export default async function handler(req, res) {
  // 1. รับลิงก์ Web App จาก Environment Variable ที่ตั้งไว้ใน Vercel
  // หรือถ้ายังไม่ได้ตั้งใน Vercel ให้ใส่ลิงก์ชั่วคราวตรงส่วน String "https://script.google.com/..." ไว้ทดสอบก่อนได้
  const GAS_URL = process.env.GAS_WEB_APP_URL || "https://script.google.com/macros/s/AKfycbx92km2quxqMeY2lpZiwXn5fUq-0Eg97n88oqOscbyuIXP38oBafB_P4SBrfxJxyq8y/exec";

  // 2. อนุญาต CORS ให้หน้าเว็บเรียกใช้งาน API ได้
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // ตอบกลับ request ประเภท OPTIONS ทันที (Browser ชอบส่งมาเช็ค CORS)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const action = req.query.action || req.body?.action;
    
    // 3. จัดเตรียม Options สำหรับส่งไปหา Google Apps Script
    const fetchOptions = {
      method: req.method,
      redirect: "follow",
    };

    // ถ้ามีการเซฟข้อมูล (POST) ให้แปลง Body เป็น Text แล้วส่งไป
    if (req.method === 'POST') {
      fetchOptions.body = JSON.stringify(req.body);
      fetchOptions.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
    }

    // 4. สร้าง URL และผูก Parameters (สำหรับ GET)
    const url = new URL(GAS_URL);
    if (req.method === 'GET' && action) {
        url.searchParams.append('action', action);
        for (const [key, value] of Object.entries(req.query)) {
            if (key !== 'action') url.searchParams.append(key, value);
        }
    }

    // 5. ทำการเรียกไปที่ Google Apps Script
    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.json();

    // 6. ส่งข้อมูลที่ได้กลับไปให้หน้าเว็บ index.html
    res.status(200).json(data);
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ status: 'error', message: 'Internal Server Error connecting to Apps Script' });
  }
}
