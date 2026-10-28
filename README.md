ProjectDemo Video link:https://drive.google.com/file/d/1v2JpIQF6AqhqIG9UG8h_O2OzeDqfcG7_/view?usp=sharing
<p align="center">
  <img src="public/logo-256.png" alt="Pundra University of Science and Technology logo" width="140">
</p>

# PUB SafeCampus

**Emergency response and campus safety for Pundra University of Science and Technology (PUB), Gokul, Bogura.**

A student who is harassed, hurt, or in danger can ask for help in seconds. The alert reaches the right responder team, appears live on a map, and is tracked until it is resolved.

> **Prototype, test mode.** No real SMS is sent and no real emergency service (such as 999) is ever contacted. Phone numbers in the app are fake (`TEST-0101`, and so on).

Built for the **PUB CSE Fest-26 Hackathon, Track C2**.

[English](README.md) | [বাংলা](README.bn.md)

**Live demo:** https://pub-safecampus.onrender.com *(free hosting: the first visit after a quiet period can take up to a minute)*

---

## Contents

1. [The problem](#the-problem)
2. [Our solution](#our-solution)
3. [Features](#features)
4. [How to use the app](#how-to-use-the-app)
5. [How it works](#how-it-works)
6. [Tech stack](#tech-stack)
7. [Run it locally](#run-it-locally)
8. [Deploy](#deploy)
9. [Configuration](#configuration)
10. [Project structure](#project-structure)
11. [Tests](#tests)
12. [Limitations and next steps](#limitations-and-next-steps)
13. [Team](#team)

---

## The problem

In a campus emergency, students often do not know who to call. Responders do not know where the problem is. Reports of harassment or ragging go unreported because students fear being identified.

## Our solution

| Student | Responder | Admin |
|---|---|---|
| Sends an SOS or a report | Sees every alert live on a map | Broadcasts notices |
| Chats with the responder | Acknowledges and updates status | Manages responders |
| Tracks status in real time | Chats with the reporter | Sees analytics and a heat map |

---

## Features

### For students
- **SOS button.** Hold for 1.5 seconds, then you get a 5-second countdown to cancel (this prevents false alarms). It sends your identity, live location and time. Your saved emergency contacts are notified.
- **Category reports.** Medical emergency, Harassment, Ragging, Fire, Accident, Theft and Hazard. Add a description, a photo or video, and a location (a pin on the map, or a building plus room).
- **Anonymous reporting** for harassment and ragging. The server never stores who sent it.
- **Live status tracking.** Reported, Acknowledged, On the way, Resolved, with a timestamp for each step.
- **Chat** with the assigned responder.
- **Emergency directory** with one-tap call (a test screen in test mode).
- **Broadcast notices** from the university, with an "I have read this" confirmation.
- **Works offline.** Reports are queued on the phone and sent when the network returns. If there is no data, the app prepares an SMS instead.
- **Installable on a phone** (PWA, "Add to Home Screen") with the university logo as the icon.

### For responders
- **Live map** of all alerts, ordered by severity.
- **Routing.** Each category goes to the right teams (for example, Fire goes to the Fire service and Security).
- **Nearest responder** suggestion, based on duty status and location.
- **Assign, acknowledge, and update** the status of each alert.

### For admins
- **Broadcasts** (information, drill, warning) with a read percentage per notice.
- **Responder management.** Add responders and set them on or off duty.
- **Analytics.** Incidents by category and location, average response time, and an **incident heat map**.

---

## How to use the app

### Signing in

On the sign-in page, tap a button under **Try a demo account** to sign in with one tap, or type the details below. New users can choose **Create account** (name, email, and a password of at least 8 characters; student ID and phone are optional).

| Role | Email | Password |
|---|---|---|
| Student | `student@safecampus.test` | `student1234` |
| Responder (Security) | `security@safecampus.test` | `responder1234` |
| Responder (Medical) | `medical@safecampus.test` | `responder1234` |
| Admin | `admin@safecampus.test` | `admin1234` locally. On Render, use the `ADMIN_PASSWORD` value from the service's **Environment** tab. |

### As a student

Tabs: **Home, Report, My alerts, Directory, Broadcasts.**

1. **Send an SOS.** On **Home**, press and hold the red SOS button for 1.5 seconds. Allow location access when asked. A 5-second countdown starts; cancel it if it was a mistake. When it ends, the alert goes out with your name, live location and time.
2. **Report something else.** On **Home** or **Report**, pick a category, describe what happened, attach a photo or video if you can, and set the place on the map or choose a building. Then send.
3. **Report anonymously.** For Harassment or Ragging, turn on **Report anonymously** before sending.
4. **Follow your case.** Open **My alerts** to see the status, the times, and to chat with the responder. Chat closes when the case is resolved.
5. **Directory.** Find the campus emergency numbers.
6. **Broadcasts.** Read notices from the university and press **I have read this** when asked.
7. **Emergency contacts.** At the bottom of **Home**, add up to 5 people who should be told when you send an SOS.
8. **No GPS?** Tap the map on **Home** to set your position by hand.
9. **No internet?** Send the report anyway. It is saved on your phone and sent automatically when you are back online.

### As a responder

Tabs: **Dashboard, Broadcasts, Directory.**

1. Switch **On duty** on at the top so you can be matched to nearby alerts.
2. On **Dashboard**, new alerts appear on the map by themselves, most severe first.
3. Open an alert and press **Acknowledge**, then **On the way**, then **Mark resolved** as the case progresses.
4. Use the chat inside the alert to talk to the reporter. For anonymous reports you see only an alias.

### As an admin

Tabs: **Dashboard, Reports, Broadcasts, Responders, Directory.**

1. **Dashboard** shows every alert and lets you assign a team or responder.
2. **Broadcasts**: write a notice or use a template (Fire drill, Flood warning, All clear). Watch the percentage of people who confirmed reading it.
3. **Reports**: average response time, incidents by category and location, and the heat map.
4. **Responders**: add a responder (name, email, temporary password, team) and set people on or off duty.

### Menu

The **Menu** button at the top right has **Simulate offline (demo)** and **Sign out**.

### Demo walkthrough

1. **Student:** hold the red SOS button, allow location, and let the countdown finish.
2. **Responder** (another browser or an incognito window): the alert appears on the map. Open it and press Acknowledge, On the way, Mark resolved.
3. **Student:** watch the status change under *My alerts*, and chat.
4. **Student:** report *Harassment* with "Report anonymously". The responder sees only an alias.
5. Turn on **Simulate offline**, send a report, then turn it off and watch it send by itself.
6. **Admin:** send a *Fire drill* broadcast. Confirm it on the student side, and watch the read percentage rise. Open *Reports* for the heat map.

---

## How it works

```
 Student phone (PWA)                     Server (Node.js)                    Responder / Admin
 ┌──────────────────┐   HTTPS + JSON    ┌───────────────────────┐   live    ┌────────────────────┐
 │ SOS / Report     │ ────────────────▶ │ routes.js  (API)      │ ────────▶ │ Dashboard + map    │
 │ Offline queue    │                   │ service.js (rules)    │  (SSE)    │ Assign / status    │
 │ Status + chat    │ ◀──────────────── │ db.js      (SQLite)   │ ◀──────── │ Chat / analytics   │
 └──────────────────┘   live updates    └───────────────────────┘           └────────────────────┘
```

1. A student sends an SOS or a report. The server saves it and works out the severity from its category.
2. The server routes it to the right team and suggests the nearest on-duty responder.
3. Every open dashboard receives the alert instantly through **Server-Sent Events** (no page refresh).
4. A responder acknowledges, goes on the way, and marks it resolved. Each step is time-stamped, and the student sees it live.
5. When the alert is resolved, live location sharing stops. The saved location is blurred to about 100 m.

### Privacy and safety by design
- **Location only with permission.** Without permission, no location is sent with an SOS. Live updates run only while the alert is open.
- **Anonymous reports.** The server does not store the reporter's id. The reporter finds their own report using a secret key (`HMAC(secret, userId)`). Responders and admins see only an alias such as `Anon-3F9A`.
- **Photos are cleaned in the browser** before upload, so hidden location data (EXIF) is removed.
- **Sensitive categories stay out of SMS.** Harassment and ragging cannot be reported by SMS.
- Passwords use `scrypt`. Login tokens are HMAC-signed. The API has rate limiting and security headers.

---

## Tech stack

| Part | Technology |
|---|---|
| Frontend | Plain HTML, CSS and JavaScript (no framework, no build step), PWA with a service worker |
| Backend | Node.js 22.5+, built-in HTTP server, no dependencies |
| Database | SQLite (Node's built-in `node:sqlite`) |
| Live updates | Server-Sent Events |
| Map | Leaflet with OpenStreetMap, and a simple SVG plot when there is no internet |
| Offline | IndexedDB queue and SMS fallback |
| Deploy | Docker, `render.yaml` for Render |

**No `npm install` is needed.**

---

## Run it locally

Requires **Node.js 22.5 or newer** (https://nodejs.org).

```bash
node -v              # must be v22.5 or higher
node src/server.js   # or: npm start
```

Open <http://localhost:3000>. In VS Code you can also open this folder and press **F5**.

On first start, demo accounts and sample incidents are created. To test on a phone, open `http://<your-computer-IP>:3000` on the same Wi-Fi. GPS and "Add to Home Screen" need HTTPS, so use the deployed link for those.

---

## Deploy

**Render (free):**

1. Push this repository to GitHub. `Dockerfile` and `render.yaml` must be at the top level of the repository.
2. On [render.com](https://render.com), choose **New, then Blueprint**, and select the repository.
3. Render reads `render.yaml` and the `Dockerfile`, then builds and starts the app.
4. Open the public link Render gives you. Check `/api/health`; it returns `{"ok":true,...}`.

Free hosting sleeps after about 15 minutes without visits, and it can reset the SQLite file when the service restarts. This is fine for a demo. For real use, attach a persistent disk or use a managed database.

**Docker on any server:**

```bash
docker build -t safecampus .
docker run -d -p 3000:3000 -v sc-data:/data -e ADMIN_PASSWORD='a-strong-password' safecampus
```

Full guide: [DEPLOY.md](DEPLOY.md) (English) and [DEPLOY.bn.md](DEPLOY.bn.md) (বাংলা).

---

## Configuration

Copy `.env.example` to `.env`. Every value is optional.

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default 3000) |
| `TEST_MODE` | `true` means no real SMS or calls (default) |
| `DEMO_ACCOUNTS` | Show demo logins and sample data |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First admin account (change the password) |
| `JWT_SECRET` | Token secret (auto-generated if empty) |
| `SMS_WEBHOOK_URL` | Where SMS is posted when `TEST_MODE=false` |
| `SMS_NUMBER` | Number shown to users for the offline SMS fallback |
| `SMS_INBOUND_SECRET` | Secret for the inbound SMS webhook |

Inbound SMS format: `SC <CATEGORY> [buildingId] [lat,lng] text`, for example `SC MEDICAL cse 23.7806,90.4 student fainted`. The sender's phone number must be registered.

Campus data (map centre, buildings with latitude and longitude, emergency numbers) lives in **`campus.json`**. Building positions marked approximate should be replaced with exact values from Google Maps.

---

## Project structure

```
├── campus.json        Campus map centre, buildings, emergency directory
├── Dockerfile         Container image for deployment
├── render.yaml        Render Blueprint (one-click deploy)
├── src/
│   ├── server.js      Starts the server
│   ├── http.js        Router, static files, security headers, rate limit
│   ├── routes.js      All API endpoints
│   ├── service.js     Business rules, privacy, nearest responder
│   ├── db.js          SQLite tables
│   ├── auth.js        Passwords, tokens, anonymous key
│   ├── hub.js         Live updates (SSE)
│   ├── notify.js      Messages to emergency contacts (recorded only in test mode)
│   └── seed.js        Demo data
├── public/            Web app (PWA): index.html, app.js, app.css, sw.js, logo and icons
└── test/api.test.js   Automated tests
```

## Tests

```bash
npm test
```

13 tests cover sign-in, SOS and location consent, status order, access control, anonymous privacy, upload checks, broadcasts, the live stream, analytics, the nearest responder, the SMS webhook and security headers.

---

## Limitations and next steps

- No push notifications when the app is closed (Web Push can be added).
- One server with SQLite suits a medium campus. A very large deployment needs PostgreSQL and more than one server.
- No OTP verification of phone numbers or email yet.
- Building positions need exact GPS values before real use.
- The map library loads from the unpkg CDN. If campus internet is limited, download Leaflet into `public/`. The app shows a simple fallback map if it cannot load.
- Before a real pilot: turn on HTTPS, change the admin password, set `DEMO_ACCOUNTS=false`, connect an SMS gateway, test it, then set `TEST_MODE=false`. Back up the `data/` folder regularly.

---

## Team

Team Name:The VARCHARs
Team ID:Track C2

Team Member
Member1:
MD Abdullah Al Mamun
leader

Member2:
MD Sazib ahmed
Video Editor

Member3:
MD Sarzil Anam chowdhury

Member4:
 MD. MEHEDI HASAN

Member5:
SYED ABRAR MOJAHID



---

&copy; Pundra University of Science and Technology, Bogura. *Learn for Life.*
