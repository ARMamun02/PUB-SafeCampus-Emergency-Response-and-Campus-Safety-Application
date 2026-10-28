# PUB SafeCampus

ক্যাম্পাসে হয়রানি, দুর্ঘটনা, চিকিৎসা-জরুরি অবস্থা বা আগুনের মতো ঘটনায় কয়েক সেকেন্ডে সাহায্য চাওয়া, সঠিক রেসপন্ডারের কাছে পৌঁছানো এবং সমাধান না হওয়া পর্যন্ত ট্র্যাক করার অ্যাপ্লিকেশন।
(PUB CSE Fest-26 Hackathon, Track C2)

**কোনো `npm install` লাগে না।** শুধু Node.js 22.5 বা তার পরের সংস্করণ লাগে (SQLite, HTTP, crypto সবই Node-এর ভেতরের)।

> অনলাইনে ডিপ্লয় করতে [DEPLOY.md](DEPLOY.md) দেখুন।

## ভিএস কোডে চালানো (সবচেয়ে সহজ)

1. ভিএস কোডে **File > Open Folder** দিয়ে এই `safecampus` ফোল্ডারটি খুলুন।
2. **F5** চাপুন। নিচের টার্মিনালে সার্ভার চালু হবে।
3. ব্রাউজারে খুলুন: <http://localhost:3000>
4. বন্ধ করতে Shift+F5 চাপুন।

## চালানোর নিয়ম

```bash
node -v            # v22.5 বা তার বেশি হতে হবে
node src/server.js
```

তারপর ব্রাউজারে খুলুন: <http://localhost:3000>

প্রথমবার চালালে ডেমো অ্যাকাউন্ট ও নমুনা ঘটনা নিজে থেকেই তৈরি হয়। লগইন পেজে ডেমো অ্যাকাউন্টের বাটন আছে:

| ভূমিকা | ইমেইল | পাসওয়ার্ড |
|---|---|---|
| Student | student@safecampus.test | student1234 |
| Responder (Security) | security@safecampus.test | responder1234 |
| Responder (Medical) | medical@safecampus.test | responder1234 |
| Admin | admin@safecampus.test | admin1234 |

ফোনে পরীক্ষা করতে একই Wi-Fi-তে ফোন থেকে `http://<কম্পিউটারের IP>:3000` খুলুন। মনে রাখবেন, ফোনের GPS ও "Add to Home Screen" ঠিকমতো চলতে **HTTPS** লাগে (নিচে দেখুন)।

## ক্যাম্পাসের তথ্য বদলান (গুরুত্বপূর্ণ)

`campus.json` ফাইলে ম্যাপের কেন্দ্র, ভবনের তালিকা (অক্ষাংশ/দ্রাঘিমাংশ সহ) এবং জরুরি নম্বরের তালিকা আছে। বর্তমান মানগুলো **শুধু নমুনা**। আপনার ক্যাম্পাসের আসল তথ্য বসান, তারপর সার্ভার আবার চালু করুন।

## ডেমো দেখানোর ক্রম

1. **Student:** Home থেকে SOS বাটন ১.৫ সেকেন্ড চেপে ধরুন, "Allow" দিন, ৫ সেকেন্ডের কাউন্টডাউন শেষ হতে দিন।
2. **Responder** (আরেকটি ব্রাউজার বা Incognito উইন্ডোতে): অ্যালার্ট নিজে থেকে ম্যাপে আসবে। সেটি খুলে Acknowledge, On the way, Mark resolved চাপুন।
3. **Student:** My alerts-এ স্ট্যাটাস বদলে যাওয়া দেখুন এবং চ্যাট করুন।
4. **Student:** Report থেকে "Harassment" বেছে "Report anonymously" চালু করে পাঠান। Responder/Admin পেজে নাম ও আইডি দেখা যাবে না।
5. উপরের "Simulate offline" চালু করে রিপোর্ট পাঠান, "Prepare SMS instead" দেখুন, তারপর বন্ধ করলে রিপোর্ট নিজে চলে যাবে।
6. **Admin:** Broadcast পাঠান (Fire drill), Student-এ "Confirm I have read this" চাপুন, Admin-এ পাঠকের শতাংশ বাড়বে। Reports ট্যাবে গড় সাড়া দেওয়ার সময় ও হিট ম্যাপ দেখুন।

## Required feature কোথায় আছে

| # | Feature | কোথায় |
|---|---|---|
| 1 | SOS (hold, cancel countdown, identity + live location + time, emergency contacts) | `public/app.js` (`beginSOS`, `startCount`, `sendSOS`), `POST /api/incidents` |
| 2 | Category report, description, photo/video, map pin বা building + room | Report ট্যাব, `POST /api/incidents` |
| 3 | Anonymous reporting (harassment, ragging) | `src/routes.js`, `src/auth.js` (`anonKey`) |
| 4 | Responder dashboard: map, severity order, assign, acknowledge | Dashboard ট্যাব, `/api/incidents/:id/assign`, `/status` |
| 5 | Status tracking + timestamps + reporter-responder chat | `status_history` টেবিল, `/messages`, Server-Sent Events |
| 6 | Emergency directory, one-tap call | `campus.json`, Directory ট্যাব |
| 7 | Broadcast + read confirmation | `/api/broadcasts`, `/read` |
| 8 | Offline fallback: queue + SMS | `public/app.js` (IndexedDB queue), `public/sw.js`, `POST /api/sms/inbound` |
| 9 | History, response time, category/location report, heat map | `GET /api/analytics`, Reports ট্যাব |
| Opt | Nearest responder, SMS simulation | `nearestResponder` in `src/service.js` |

## Restriction কীভাবে মানা হয়েছে

- **Prototype লেবেল ও test mode:** সব পেজের উপরে "Prototype · Test mode" দেখায়। `TEST_MODE=true` (ডিফল্ট) থাকলে সার্ভার কোনো SMS বা কল পাঠায় না। বার্তাগুলো শুধু `notifications` টেবিলে জমা হয় ও লগে ছাপা হয়।
- **৯৯৯ বা বাস্তব জরুরি সেবায় কল না:** test mode-এ "Call" বাটন শুধু একটি টেস্ট স্ক্রিন দেখায়। ডিরেক্টরিতে কোনো বাস্তব জরুরি নম্বর রাখা নেই।
- **লোকেশন:** অনুমতি ছাড়া SOS-এ লোকেশন যায় না। অ্যালার্ট খোলা থাকা অবস্থায়ই শুধু আপডেট নেওয়া হয়। Resolve হলে শেয়ার বন্ধ হয় এবং সংরক্ষিত অবস্থান প্রায় ১০০ মিটারের মধ্যে ঝাপসা করা হয়।
- **Anonymous:** সার্ভার `reporter_id` সংরক্ষণই করে না। রিপোর্টার নিজের রিপোর্ট খুঁজে পায় একটি গোপন কী (`HMAC(secret, userId)`) দিয়ে, যা সার্ভারের গোপন মান ছাড়া ব্যবহারকারীর সঙ্গে মেলানো যায় না। রেসপন্ডার ও অ্যাডমিন শুধু একটি ছদ্মনাম (Anon-XXXX) দেখেন। ছবি আপলোডের আগে ব্রাউজারে ক্যানভাসে আবার আঁকা হয়, তাই ছবির ভেতরের লুকানো লোকেশন (EXIF) থাকে না।

## কনফিগারেশন (`.env`)

`.env.example` কপি করে `.env` বানান। সব মান ঐচ্ছিক।

| নাম | কাজ |
|---|---|
| `PORT` | সার্ভারের পোর্ট (ডিফল্ট 3000) |
| `TEST_MODE` | `true` হলে কোনো বাস্তব SMS/কল যায় না |
| `DEMO_ACCOUNTS` | ডেমো অ্যাকাউন্ট ও নমুনা তথ্য চালু/বন্ধ |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | প্রথম অ্যাডমিন (আসল ব্যবহারে অবশ্যই বদলান) |
| `JWT_SECRET` | টোকেনের গোপন মান (খালি থাকলে `data/.secret`-এ নিজে তৈরি হয়) |
| `SMS_WEBHOOK_URL` | `TEST_MODE=false` হলে এই ঠিকানায় `{to, text}` JSON পাঠানো হয় (আপনার SMS গেটওয়ে) |
| `SMS_NUMBER` | অফলাইনে SMS পাঠানোর নম্বর, ব্যবহারকারীকে দেখানো হয় |
| `SMS_INBOUND_SECRET` | `POST /api/sms/inbound` ওয়েবহুকের গোপন মান |

SMS-এ আসা বার্তার ফরম্যাট: `SC <CATEGORY> [buildingId] [lat,lng] লেখা`, যেমন `SC MEDICAL cse 23.7806,90.4 student fainted`। ফোন নম্বর নিবন্ধিত থাকতে হবে। গোপনীয়তার কারণে harassment/ragging SMS-এ নেওয়া হয় না।

## প্রজেক্টের কাঠামো

```
campus.json          ক্যাম্পাস, ভবন, জরুরি নম্বর
src/server.js        সার্ভার চালু করা
src/http.js          রাউটার, স্ট্যাটিক ফাইল, নিরাপত্তা হেডার, রেট লিমিট
src/routes.js        সব API
src/service.js       ঘটনার ডেটা সাজানো, গোপনীয়তার নিয়ম, নিকটতম রেসপন্ডার
src/db.js            SQLite টেবিল (data/safecampus.db)
src/auth.js          পাসওয়ার্ড (scrypt), টোকেন (HMAC), গোপন কী
src/hub.js           লাইভ আপডেট (Server-Sent Events)
src/notify.js        জরুরি যোগাযোগকে বার্তা (test mode-এ শুধু রেকর্ড)
src/seed.js          ডেমো তথ্য
public/              ওয়েব অ্যাপ (PWA): index.html, app.js, app.css, sw.js
public/logo*.png     বিশ্ববিদ্যালয়ের লোগো ও আইকন (icon-*.png, favicon, og-image)
DEPLOY.md            ডিপ্লয় গাইড (Render, Docker)
test/api.test.js     স্বয়ংক্রিয় টেস্ট (npm test)
```

## টেস্ট

```bash
npm test        # বা: node --test test/api.test.js
```

১৩টি টেস্ট আছে: লগইন, SOS ও লোকেশনের অনুমতি, স্ট্যাটাসের ক্রম, অন্যের ঘটনা দেখা বন্ধ, anonymous গোপনীয়তা, ফাইল আপলোডের যাচাই, broadcast, লাইভ স্ট্রিম, analytics, নিকটতম রেসপন্ডার, SMS ওয়েবহুক, নিরাপত্তা হেডার।

## আসল ব্যবহারের আগে (Go-live checklist)

1. **HTTPS** চালু করুন (Caddy বা nginx রিভার্স প্রক্সি, বা Cloudflare Tunnel)। ছাড়া ফোনে GPS ও PWA ইনস্টল কাজ করবে না।
2. `ADMIN_PASSWORD` বদলান, `DEMO_ACCOUNTS=false` করুন, `data/` ফোল্ডার থেকে পুরনো ডেমো ডাটাবেস মুছে নতুন করে শুরু করুন।
3. `campus.json`-এ আসল ভবন, স্থানাঙ্ক ও ক্যাম্পাসের জরুরি নম্বর বসান।
4. SMS গেটওয়ে ঠিক করে `SMS_WEBHOOK_URL` দিন, তারপর বাস্তব পরীক্ষা শেষে `TEST_MODE=false` করুন।
5. `data/` ফোল্ডারের নিয়মিত ব্যাকআপ রাখুন (ডাটাবেস ও আপলোড করা ছবি)।
6. ম্যাপ লাইব্রেরি (Leaflet) এখন unpkg CDN থেকে লোড হয়। ক্যাম্পাস নেটওয়ার্কে ইন্টারনেট সীমিত হলে `leaflet.js` ও `leaflet.css` ডাউনলোড করে `public/` এ রেখে `index.html`-এর লিংক বদলান। লাইব্রেরি লোড না হলে অ্যাপ নিজে থেকে সরল একটি ম্যাপ প্লট দেখায়।

## বর্তমান সীমাবদ্ধতা

- অ্যাপ বন্ধ থাকলে ফোনে পুশ নোটিফিকেশন আসে না। (Web Push যোগ করা যায়।)
- একটি সার্ভার ও SQLite, মাঝারি ক্যাম্পাসের জন্য যথেষ্ট। অনেক বড় আকারে PostgreSQL ও একাধিক সার্ভার লাগবে।
- ফোন নম্বর ও ইমেইল যাচাই (OTP) নেই।
- Docker দিয়েও চালানো যায়: `docker build -t safecampus . && docker run -p 3000:3000 -v sc-data:/data safecampus`
