# Distributing Swerte3 (Expo / EAS Build)

This document explains how to produce **installable Android builds** for testers, how they differ from **Expo Go**, and how **API URLs** and **secrets** actually work. It is written for this repo’s layout: **`mobile/`** = Expo app, **`backend/`** = FastAPI API.

**HTML version (same content, printable / browser):** [DISTRIBUTION.html](./DISTRIBUTION.html)

---

## 0. The app does **not** run without the backend (read this first)

Building an APK is only **half** of what makes Swerte3 work for testers.

| Piece | What it is | What **you** must do |
|--------|------------|----------------------|
| **Mobile (APK)** | The screen in your friend’s hand | Build with EAS; set **`EXPO_PUBLIC_API_URL`** on Expo so the APK knows **where** to send requests. |
| **Backend (API)** | Login, database, GCash payments (server keys), everything “smart” | **Run it** (e.g. `uvicorn` on your PC) **and** expose it on the internet (e.g. **ngrok**) **or** deploy it (e.g. Google Cloud). Load **`backend/.env`** (or cloud secrets) **on that server** — same as when *you* test. |

**Expo environment variables do not start your API.** They only tell the **mobile app** which **public URL** to call. If the backend is off, or ngrok is off, or the URL is wrong, the APK will open but **sign-in / payments / data will fail** — because there is nothing answering at that address.

**So for friend testing you always do both:** (1) **Backend running** + reachable at the URL in `EXPO_PUBLIC_API_URL`, with **`backend/.env` configured there**, and (2) **APK built** with that same URL baked in (Expo **preview** env + `eas build --profile preview`).

---

## 1. What you are building

| Artifact | Typical use |
|----------|-------------|
| **APK** (`preview` profile) | Email/Drive/Telegram to friends; they install with “unknown sources”. |
| **AAB** (`production` profile) | Upload to **Google Play** (not for direct side-load). |
| **Expo Go** | Fast dev on your phone; **not** what you send to friends for a stable test. |

The **APK does not include your backend** and does **not** include `backend/.env`. It only ships the React Native bundle and native shell. Your API runs **separately** (your PC + ngrok, or Google Cloud, etc.).

---

## 2. How the app reaches your API (important)

- The mobile app reads **`EXPO_PUBLIC_API_URL`** (see `mobile/.env.example`). That value is **inlined into the JavaScript bundle at build time** when EAS runs Metro.
- After install, the app **always** calls whatever URL was baked into **that** build. It does **not** read your laptop’s `mobile/.env` on each launch.
- **GCash checkout keys (PayMongo API) / PayPal / DB / JWT secrets** belong in **`backend/.env`** (or cloud secrets on the server). They are **server-side only** and are **not** inside the APK.

**Implication for friends:** Their phones must be able to open **`EXPO_PUBLIC_API_URL`** on the internet. `http://127.0.0.1:8000`, `http://10.0.2.2:8000`, or a random LAN IP usually **will not work** for someone outside your Wi‑Fi.

**Ngrok:** If the APK was built with `https://OLD.ngrok-free.dev` and you restart ngrok and get `https://NEW.ngrok-free.dev`, the old APK **still** calls OLD until you **rebuild** with the new URL (unless you use a **stable** ngrok domain or a **fixed** deployed API URL).

---

## 3. What “your server” means

**Your server** = whatever process answers HTTP at the base URL you put in **`EXPO_PUBLIC_API_URL`**.

Examples:

- **Local + ngrok:** FastAPI on your PC, `uvicorn` listening on port 8000, ngrok forwarding public URL → that port. “Server” is still your machine; secrets are in **`backend/.env` on that machine**.
- **Google Cloud Run (or similar):** FastAPI container running in GCP. Secrets are set in **Cloud Run env vars** or **Secret Manager** (same *role* as `.env`, but in the cloud console).

The friend’s APK only does: **HTTPS request → that URL**. It never loads your `backend/.env` file.

---

## 4. Prerequisites

- [Expo account](https://expo.dev) (free tier can run builds; limits apply).
- **Node.js** and npm on your PC.
- For **Android APK**, you do **not** need Xcode or a Mac.
- Repo paths: work inside **`mobile/`** for all commands below.

---

## 5. Install EAS CLI and log in

```bash
npm install -g eas-cli
eas login
```

**Directory:** These two commands do **not** need to be run from `mobile/` or the repo root — `-g` installs globally and `eas login` is account-wide. Use the same Expo account you will link to this project.

---

## 6. Link the project (once per app)

From **`mobile/`** (where `app.json` lives):

```bash
cd path/to/Swerte3/mobile
eas init
```

Follow prompts to create or select the Expo project on expo.dev.

---

## 7. Configure EAS Build (once)

```bash
eas build:configure
```

This repo includes **`eas.json`** with:

- **`preview`** — Android **`buildType: "apk"`** (shareable file).
- **`production`** — Android **`app-bundle`** (Play Store).
- **`development`** — dev client (optional; for custom native dev builds).

If the wizard suggests merging options, keep **`preview`** as APK for friend testing.

---

## 8. Set the API URL for the build (critical)

EAS builds run **in the cloud**. They **do not** automatically see your local `mobile/.env` unless you wire env in.

**Options:**

1. **EAS environment variables (recommended)**  
   In [expo.dev](https://expo.dev) → Project → **Environment variables**, add:
   - `EXPO_PUBLIC_API_URL` = your **public** API base, e.g. `https://your-api-xxxxx.run.app` or `https://your-subdomain.ngrok-free.dev`  
   No trailing slash (match how `api.ts` uses it).
   - When adding the variable, set **Environments** to **preview** for `eas build --profile preview` (APK). A variable scoped only to **development** is **not** applied to preview/production builds — add the same name/value again for **preview**, or edit the variable to include **preview**.

2. **`eas.json` env on the profile** (simple but commits URL if not careful):

   ```json
   "preview": {
     "env": {
       "EXPO_PUBLIC_API_URL": "https://your-public-api.example.com"
     },
     ...
   }
   ```

3. **Secrets** — For values that must not appear in git, use Expo’s **EAS Secrets** / project environment configuration (see current [Expo EAS Environment variables](https://docs.expo.dev/eas/environment-variables/) docs).

**Rule:** Whatever you set for **`EXPO_PUBLIC_API_URL` at build time** is what every installed APK uses until you ship a **new** build.

---

## 9. Build an Android APK (friend testing)

From **`mobile/`**:

```bash
eas build --platform android --profile preview
```

- First Android build: EAS will ask about **signing**. Let **EAS manage credentials** unless you already have a keystore you must reuse.
- When the build finishes, the CLI prints a **link** and may show a **QR code** in the terminal. You can also open **expo.dev** → your project → **Builds** → open the finished build (same URL pattern: `expo.dev/accounts/.../projects/.../builds/<id>`).

---

## 10. Share with testers (link, QR, or APK file)

### Option A — Send the link (and QR from the dashboard)

- **Just the URL:** Copy the **build page URL** from the browser (or from the CLI) and send it to friends. They open it on **Android** (Chrome) and follow **Install**.
- **QR code on expo.dev:** On the build page, find **Build artifact** (with the **APK** label). The QR is **not** shown on the main screen — click the white **Install** button. Expo opens a step (modal / panel) where the **QR code** appears so they can scan it with an Android phone to install.
- **Terminal:** After `eas build` completes, a QR may already be printed in the terminal; they can scan that too.
- Some **internal / preview** installs may ask the tester to **sign in** with a free Expo account. To avoid that, use **Option B** (raw `.apk`).

### Option B — Download the `.apk` and share the file

1. On **expo.dev**, open the same finished build.
2. In **Build artifact**, use the **⋮** (three-dot) menu beside **Install** / **Open with Orbit** and choose **Download** (labels vary), or look for **Artifacts** with a direct **`.apk`** download.
3. Save the file on your PC, then upload to **Google Drive**, **Telegram**, **email** (if under size limits), etc., or attach directly in chat.
4. Friends download on the phone, open the **`.apk`**, and install (see §11).

**They must trust you** — installs are not from the Play Store.

---

## 11. Tester checklist (Android)

1. **Settings → Apps → Special access** (or **Security**) → allow **Install unknown apps** for **Chrome** / **Files** / **Drive** (whichever opens the APK).
2. Download/open the **`.apk`** → **Install**.
3. If Play Protect appears, they confirm only if they trust the source.

---

## 12. Common failures

| Symptom | Likely cause |
|---------|----------------|
| Login / network errors for friends | **`EXPO_PUBLIC_API_URL`** not public, wrong, or PC/ngrok off. |
| Worked yesterday, broken today (ngrok) | Ngrok URL changed; **rebuild APK** or use stable/deployed URL. |
| Build succeeded but app calls wrong API | Env not set for EAS; build used default or empty — fix env and **rebuild**. |
| “App not installed” | Corrupt download or ABI mismatch — re-download or rebuild. |
| `eas build` fails uploading tarball — `git clone … exited with non-zero code: 128` (Windows) | Often **dubious ownership**: `.git` owned by Administrators but your user runs Git. Run once (use your real project path):<br>`git config --global --add safe.directory "C:/Users/jonel/OneDrive/Desktop/Jonel_Projects/Swerte3/.git"`<br>Then `eas build` again. |
| `EPERM: operation not permitted, scandir '…\.pytest_cache'` | EAS was scanning `backend/.pytest_cache` (often locked on OneDrive). This repo adds **`.easignore`** at the monorepo root to skip **`backend/`** on upload (not needed to compile the Expo app). **Commit** `.easignore` before `eas build` so it is included in the git snapshot EAS uses. |

---

## 13. Production / Play Store (later)

```bash
eas build --platform android --profile production
```

You get an **AAB**. Upload that to **Google Play Console**. Keep using **EAS-managed signing** for the same app so updates stay consistent.

---

## 14. iPhone / iOS — sharing with friends (detailed)

iOS is **stricter** than Android: there is **no** “send a file like an APK” for a **standalone** app. For that, testers use **Apple’s system** (almost always **TestFlight**). That path needs the paid Apple program (§14.2).

### 14.0 I only want to **test** on my iPhone — do I pay $99?

**No**, if you are fine with **Expo Go** (quick dev testing):

1. On the iPhone, install **[Expo Go](https://apps.apple.com/app/expo-go/id982107779)** from the App Store (free).
2. On your PC, from `mobile/`, run **`npx expo start`** (same as local dev).
3. Connect the phone (same Wi‑Fi, or use **tunnel** if needed) and **scan the QR code** in the terminal or dev tools.

That uses **your** dev server and **does not** require the Apple Developer Program. Caveat: the app runs **inside Expo Go**, not as your final standalone binary — if you rely on custom native code that Expo Go does not include, you may need a **development build** (often still easier on **Android** first) or the paid Apple path below.

**You do pay ~$99/year** when you want a **real installable iOS build** (EAS `.ipa` → **TestFlight** or App Store) to share like a “proper” app.

### 14.1 What you need for TestFlight / standalone iOS builds (once)

| Requirement | Why |
|-------------|-----|
| **[Apple Developer Program](https://developer.apple.com/programs/)** (~$99/year) | Required for **TestFlight**, **App Store**, and typical **EAS iOS** standalone builds — **not** for Expo Go-only testing (§14.0). |
| **Apple ID** enrolled in that program | Signing and App Store Connect. |
| **`EXPO_PUBLIC_API_URL` on EAS** | Set for the same **preview** (or **production**) environment you use for the iOS build — same rule as Android (§8). |
| **`ios.bundleIdentifier` in `app.json`** | Unique app ID, e.g. `com.jonel0322.swerte3` (reverse-DNS style). Must stay stable for the life of the app on the App Store. |

You **do not** need your own Mac for the compile step if you use **EAS Build** (cloud).

### 14.2 Typical path: EAS → App Store Connect → TestFlight

1. **Register the bundle ID** (if Apple asks): [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list) — create an **App ID** matching `app.json` → `ios.bundleIdentifier`.
2. **App Store Connect**: [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → **+** → **New App** (choose iOS, same bundle ID). You only need a minimal listing for TestFlight (name, SKU, etc.).
3. **Link Apple to EAS** (first iOS build): from `mobile/`, run:
   ```bash
   eas build --platform ios --profile preview
   ```
   Follow prompts: EAS may ask you to log in with your **Apple ID**, create/use an **App Store Connect API Key**, or use an **app-specific password** — follow [Expo’s iOS credentials guide](https://docs.expo.dev/app-signing/app-credentials/).
4. **Wait for the build** on [expo.dev](https://expo.dev) → your project → **Builds** (same place as Android). A successful iOS build produces an **IPA** (handled by EAS; you usually don’t email this file).
5. **Submit to TestFlight** (if not automatic):
   ```bash
   eas submit --platform ios --profile production
   ```
   Or upload the build from the Expo build page / Transporter — see [EAS Submit](https://docs.expo.dev/submit/ios/). The build must appear under your app in **App Store Connect** → **TestFlight**.
6. **Add testers** in **App Store Connect** → **TestFlight**:
   - **Internal testing** (up to **100** users, must be invited in **Users and Access** with roles) — fast, no Beta App Review for first internal build in some cases.
   - **External testing** (email list, up to **10,000**) — usually requires a short **Beta App Review** by Apple before the first external group goes live.
7. **Your friends**: Install **TestFlight** from the **App Store** (purple icon). Open the **email invite** from Apple or use the **public link** if you enabled one in TestFlight. They tap **Accept** → **Install** for **Swerte3**.

### 14.3 Sharing with friends (compare to Android)

| Android (§10) | iPhone |
|---------------|--------|
| Link or `.apk` file | **TestFlight invite** or **TestFlight public link** (no standalone `.ipa` mail for normal friends) |
| Often no Apple account | Tester needs an **Apple ID** (free) to use TestFlight |
| Install unknown sources | No — Apple installs only through TestFlight / App Store |

### 14.4 Backend reminder

Same as Android: **your API + ngrok (or deployed URL)** must be running at **`EXPO_PUBLIC_API_URL`** when they use the app.

### 14.5 Other options (brief)

- **Development device / ad hoc**: Register **UDIDs**, provisioning profiles, small teams — heavy manual work; not ideal for “many friends.”
- **Expo Go**: Good for **you** during dev; not a substitute for a real **TestFlight** build for external testers.

Official overview: [Expo iOS build](https://docs.expo.dev/build/setup/), [TestFlight](https://developer.apple.com/testflight/).

---

## 15. One-line recap

**Android:** Set `EXPO_PUBLIC_API_URL` for **preview** → `eas build --platform android --profile preview` → share link / QR / `.apk` (§10) → keep API running.

**iPhone:** Apple Developer Program → `eas build --platform ios --profile preview` (and submit to TestFlight) → friends install via **TestFlight** (§14) → same API URL env as Android.

For GCash payments/webhooks, see **`backend/.env.example`** — webhook URL must match your **public** API host.
