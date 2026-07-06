// ตั้งค่าตัวแปรต่างๆ ของระบบ
window.CONFIG = {
    // API_URL จะเรียกไปที่โฟลเดอร์ api/gas.js ของ Vercel เพื่อแก้ปัญหา CORS
    // (ห้ามเอาลิงก์ Google Apps Script มาใส่ตรงนี้นะครับ ให้ใส่ใน Vercel แทน)
    API_URL: '/api/gas',
    
    // ตั้งค่ารหัสผ่าน (PIN) สำหรับเข้าโหมดครู
    TEACHER_PIN: '1234' 
};