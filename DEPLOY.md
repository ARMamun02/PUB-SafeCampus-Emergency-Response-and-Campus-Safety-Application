# ডিপ্লয় করার নিয়ম (PUB SafeCampus)

অ্যাপে কোনো `npm install` বা build step নেই। Docker image দিয়েই চলে। নিচের যেকোনো একটি পথ বেছে নিন।

## পথ ১: Render (ফ্রি, সবচেয়ে সহজ)

1. এই `safecampus` ফোল্ডারটি GitHub-এ একটি নতুন repository হিসেবে push করুন:
   ```bash
   git init && git add . && git commit -m "PUB SafeCampus"
   git branch -M main
   git remote add origin https://github.com/<আপনার-নাম>/pub-safecampus.git
   git push -u origin main
   ```
2. <https://render.com> এ GitHub দিয়ে লগইন করুন।
3. **New > Blueprint** চাপুন, repository বেছে নিন। `render.yaml` দেখে Render নিজেই সব সেট করবে।
4. Deploy শেষ হলে `https://pub-safecampus.onrender.com`-এর মতো একটি HTTPS লিংক পাবেন। ফোনে GPS ও "Add to Home Screen" এই লিংকে ঠিকমতো চলবে।
5. অ্যাডমিন পাসওয়ার্ড দেখতে: Render > আপনার service > **Environment** > `ADMIN_PASSWORD`।

ফ্রি প্ল্যানে মনে রাখুন:
- ১৫ মিনিট কেউ না ঢুকলে সার্ভার ঘুমিয়ে যায়। ডেমোর আগে একবার লিংক খুলে রাখুন (প্রথমবার ৩০-৬০ সেকেন্ড লাগে)।
- ডিস্ক স্থায়ী নয়, তাই restart/redeploy-এ ডাটাবেস মুছে নতুন করে ডেমো ডেটা তৈরি হয়। হ্যাকাথনের ডেমোর জন্য এটাই যথেষ্ট। স্থায়ী ডেটা লাগলে paid plan-এ একটি Disk যোগ করে `/data`-তে mount করুন।

## পথ ২: যেকোনো সার্ভার বা VPS (Docker)

```bash
docker build -t pub-safecampus .
docker run -d --name safecampus -p 3000:3000 \
  -v sc-data:/data --restart unless-stopped \
  -e ADMIN_PASSWORD='একটি-শক্ত-পাসওয়ার্ড' \
  pub-safecampus
```

সামনে Caddy বা nginx দিয়ে HTTPS দিন। Caddy হলে `Caddyfile`-এ শুধু এটুকু:

```
safecampus.yourdomain.com {
    reverse_proxy localhost:3000
}
```

## পথ ৩: Railway / Fly.io / Koyeb

Repository দেখিয়ে দিন, তারা `Dockerfile` নিজে চিনে নেয়। Port `3000`, health check path `/api/health`।

## ডিপ্লয়ের পরে যাচাই

- `https://<আপনার-লিংক>/api/health` খুললে `{"ok":true,...}` আসবে।
- লগইন পেজে বিশ্ববিদ্যালয়ের লোগো দেখা যাবে, ফোনে "Add to Home Screen" দিলে লোগো আইকন হবে।

## Environment variable

| নাম | ডেমো | আসল ব্যবহার |
|---|---|---|
| `TEST_MODE` | `true` | `false` (SMS গেটওয়ে ঠিক করার পর) |
| `DEMO_ACCOUNTS` | `true` | `false` |
| `ADMIN_PASSWORD` | Render নিজে বানায় | শক্ত পাসওয়ার্ড |
| `JWT_SECRET` | Render নিজে বানায় | নিজে বানানো লম্বা গোপন মান |

বাকি সব কনফিগারেশন `README.md` ও `.env.example`-এ আছে।
