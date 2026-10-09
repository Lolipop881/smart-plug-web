# อัปโหลดจากมือถือด้วย GitHub Actions

1. ดาวน์โหลด SmartPlug-Cloudflare-Web.zip ไม่ต้องแตกไฟล์
2. สร้าง GitHub repository แบบ Private ชื่อ smart-plug-web เปิด Add README
3. Add file > Upload files อัปโหลด ZIP ไว้หน้าหลัก repository แล้ว Commit changes
4. เข้าบัญชี Cloudflare ในเบราว์เซอร์ของตัวเอง จด Account ID จาก Workers & Pages
5. My Profile > API Tokens > Create Token > Edit Cloudflare Workers เลือกบัญชีเป้าหมาย แล้วสร้าง Token
6. GitHub repository > Settings > Secrets and variables > Actions > New repository secret เพิ่มครบ 5 ค่า:
   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, WEB_PASSWORD, DEVICE_KEY, SESSION_SECRET
   ห้ามใส่ค่าลับลงไฟล์หรือข้อความแชต DEVICE_KEY และ SESSION_SECRET ใช้ค่าสุ่มต่างกันอย่างน้อย 32 ตัว
7. Add file > Create new file ตั้งชื่อ .github/workflows/deploy.yml
   คัดลอกเนื้อหา deploy-mobile.yml ในชุดนี้ลงไฟล์ใหม่ แล้ว Commit changes ลง main
8. Actions > Deploy Smart Plug > Run workflow > main > Run workflow
9. เมื่อผ่านครบทุกขั้นตอน ไป Cloudflare > Workers & Pages > smart-plug เปิด workers.dev URL
   ถ้ามีขั้นตอนเปิดใช้ workers.dev/subdomain ในบัญชี ให้ทำก่อนแล้ว Run workflow ใหม่
10. หน้าเว็บใส่ URL ของ Worker ตัวเอง และรหัส WEB_PASSWORD

Workflow ใช้ ZIP ที่ root ของ repository และจะแตกไฟล์เป็น deploy/smart-plug-cloud ให้เอง
ชื่อ Worker คือ smart-plug: ตรวจสอบว่าเป็นชื่อที่ต้องการก่อนรัน เพราะจะอัปเดต Worker ชื่อเดียวกันหากมีอยู่แล้ว
เมื่อแก้โค้ด ให้แทนที่ ZIP ใน repository แล้วกด Run workflow ใหม่

เว็บอัปโหลดแล้วไม่ได้หมายถึงบอร์ดพร้อม: เฟิร์มแวร์เดิมมีเฉพาะเว็บในวง LAN
ต้องเพิ่ม WebSocket TLS ไป wss://WORKER_URL/api/device/socket พร้อม DEVICE_KEY ตาม PROTOCOL.md
จนกว่าจะต่อบอร์ดสำเร็จ หน้าเว็บจะแสดงออฟไลน์และไม่ให้สั่งรีเลย์
การแฟลช ESP8266 จากมือถือขึ้นกับรุ่นมือถือ สาย OTG และเครื่องมือที่ใช้ ไม่รวมใน workflow นี้
