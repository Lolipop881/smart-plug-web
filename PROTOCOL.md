# ESP8266 protocol v1

เชื่อมต่อ WSS ไปที่ `wss://<worker-host>/api/device/socket` พร้อม HTTP header `Authorization: Bearer <DEVICE_KEY>` ห้ามใส่กุญแจใน URL และต้องตรวจ TLS certificate ด้วย trust store ที่ถูกต้อง ไม่ใช้ setInsecure()

หลังเชื่อมต่อส่ง state ทันที แล้วทุก 25 วินาที และเมื่อ GPIO เปลี่ยนจากตารางหรือนับถอยหลัง; ใช้เวลาระบบ UTC ที่ NTP เทียบแล้ว

```
{"type":"state","state":{"clockValid":true,"time":"08:00:00","channels":[
 {"name":"ช่อง 1","emoji":"💡","on":false,"daily":true,"onMinute":480,"offMinute":1080,"remaining":0,"target":false},
 {"name":"ช่อง 2","emoji":"🔌","on":false,"daily":false,"onMinute":480,"offMinute":1080,"remaining":0,"target":false},
 {"name":"ช่อง 3","emoji":"🌀","on":false,"daily":false,"onMinute":480,"offMinute":1080,"remaining":0,"target":false},
 {"name":"ช่อง 4","emoji":"🌿","on":false,"daily":false,"onMinute":480,"offMinute":1080,"remaining":0,"target":false}
]}}
```

ช่องเป็น 0–3, onMinute/offMinute เป็นนาทีหลังเที่ยงคืนเวลาไทย, remaining เป็นวินาที

Server ส่ง:

```
{"type":"command","protocol":1,"id":"uuid","action":"relay","payload":{"channel":0,"on":1},"expiresAt":1790000000000}
```

- action `relay`: channel, on 0/1; ตั้ง GPIO แล้วอ่านกลับและยกเลิก countdown ช่องนั้น
- action `all-off`: payload {}; ปิด GPIO 4 ช่องและยกเลิก countdown ทั้งหมด
- action `config`: payload {channel,name,emoji,daily,onMinute,offMinute,minutes,target}; ตรวจข้อมูลแล้ว commit EEPROM ให้สำเร็จก่อนตอบ ACK เหมือน route /config ในโค้ดเดิม
- expiresAt เป็น UTC Unix milliseconds: หากไม่มีเวลาที่เชื่อถือได้หรือหมดอายุ ให้ปฏิเสธคำสั่ง ไม่ปฏิบัติตามคำสั่งเก่า
- เก็บ id ของคำสั่งที่ประมวลผลล่าสุด ป้องกันการทำ config ซ้ำแล้วเริ่ม countdown ใหม่

เมื่อประมวลผลแล้วส่ง:

```
{"type":"ack","id":"uuid","ok":true,"state":{...ข้อมูล state หลังอ่าน GPIO กลับ...}}
```

หากบันทึกไม่สำเร็จ/คำสั่งหมดอายุส่ง `{"type":"ack","id":"uuid","ok":false}`

Server เปรียบเทียบสถานะกับ payload ก่อนทำเครื่องหมายสำเร็จ โดยไม่รับ ACK id อื่นหรือ ACK ที่หมดเวลา บอร์ด reconnect ด้วยช่วงหน่วงเพิ่ม 1,2,4,8,... สูงสุด 30 วินาที ตารางและ countdown เดิมยังรันใน loop ต่อ

อย่ารันคำสั่งเปิด/ปิดจาก callback ก่อนตรวจชนิดข้อมูล ขอบเขต channel เวลา expiry และ protocol เสร็จครบ
