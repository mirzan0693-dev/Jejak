# Jejak — setup guide

Everything here is free except the Apple developer account (only needed for iPhone).
Steps 1–2 work on your phone's browser. Step 3 needs your computer.

## 1. Create the database (Supabase, free) — ~5 min

1. Go to https://supabase.com → Start your project → sign in with GitHub or email.
2. New project → name it `jejak`, choose region **Southeast Asia (Singapore)**, set a database password (save it somewhere), Create.
3. When it's ready: left menu → **SQL Editor** → New query → paste the whole of `supabase/schema.sql` → **Run**. It should say "Success".
4. **Send sign-in codes from your Gmail** (Supabase's built-in sender only allows 2 emails an hour):
   1. Google Account → **Security** → turn on **2-Step Verification**, then open https://myaccount.google.com/apppasswords,
      create an app password named `Jejak` and copy the 16 letters.
   2. Supabase → **Authentication → Emails → SMTP Settings** → **Enable custom SMTP**:
      host `smtp.gmail.com`, port `465`, username = your Gmail address, password = the 16-letter app password,
      sender email = your Gmail address, sender name `Jejak`. Save.
   3. **Authentication → Rate Limits** → *Rate limit for sending emails* → `30` per hour → Save.
5. **Authentication → Emails → Templates**: in both **Magic Link** and **Confirm signup**, set
   subject `Your Jejak code: {{ .Token }}` and body `<h2>{{ .Token }}</h2><p>Enter this code in Jejak to sign in. It expires in 1 hour.</p>` → Save.
6. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

## 2. Put your keys in the app

Open `eas.json` and replace both `PASTE_YOUR_SUPABASE_URL` and both `PASTE_YOUR_SUPABASE_ANON_KEY` with the values from step 1.6.
(The anon key is safe to put in the app — the database rules decide what each person can see.)

## 3a. Easiest: build on GitHub (free, from your phone)

1. On GitHub open the repo → **Settings → Secrets and variables → Actions → New repository secret**. Add two:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_ANON_KEY` = your anon public key
2. **Actions** tab → pick **Build Android app (APK)** or **Build iPhone app** → **Run workflow** → Run.
3. Wait ~15 min (Android) or ~25 min (iPhone). Open the finished run → **Artifacts** at the bottom → download.
   GitHub delivers it as a .zip: unzip to get `Jejak.apk` or `Jejak-unsigned.ipa`.

**Android:** open `Jejak.apk` on the phone and install (allow "install unknown apps").

**iPhone, free (no developer account):**
1. On your Windows or Mac computer install **Sideloadly** from https://sideloadly.io (on Windows also install iTunes and iCloud from Apple's website, not the Microsoft Store).
2. Plug in the iPhone, drag `Jejak-unsigned.ipa` into Sideloadly, enter your Apple ID, Start.
3. iPhone: **Settings → Privacy & Security → Developer Mode → On** (restarts), then
   **Settings → General → VPN & Device Management → your Apple ID → Trust**.
4. The app works for **7 days**. Before it expires, plug in and press Start in Sideloadly again (your data stays).
   Free Apple IDs allow 3 sideloaded apps at once.

## 3c. iPhone without a developer account: the web app (Add to Home Screen)

Jejak also runs as a web app. On iPhone you add it to your home screen and it opens full screen like an app.
**Limit:** iPhone only lets web apps use location while they're open on screen, so your family sees your last spot
once you close it, and "Play sound" only works while it's open.

One-time hosting (free, from your phone):
1. Go to https://vercel.com → **Continue with GitHub**.
2. **Add New → Project** → pick **Jejak** → **Deploy** (settings are already in `vercel.json`).
3. Copy your site address, e.g. `https://jejak-xyz.vercel.app`.
4. Supabase → **Authentication → URL Configuration → Redirect URLs** → add `https://jejak-xyz.vercel.app/**` (your exact address).

On the iPhone:
1. Open your site address in **Safari** (not Chrome).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open **Jejak** from the home screen, sign in, and allow location and notifications.
   Sign in from the home-screen app and type the 6-digit code from the email there (don't tap any link in Safari).

Every push to GitHub updates the site automatically.

## 3b. Alternative: build with EAS — on your computer

1. Install Node.js LTS from https://nodejs.org
2. Unzip this project, open a terminal in the folder, then run:

```bash
npm install
npx eas-cli@latest login          # create a free account at expo.dev if you don't have one
npx eas-cli@latest init           # links the project to your Expo account (say yes)
```

### Android (phone + you can share the APK with family)

```bash
npx eas-cli@latest build --platform android --profile preview
```

Wait ~15 min. You get a link/QR code. Open it on each Android phone and install the APK
(allow "install unknown apps" when asked).

### iPhone

You need an **Apple Developer account** (USD 99/year, https://developer.apple.com/programs/).
Then:

```bash
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios
```

EAS signs it for you (no Mac needed). In App Store Connect → TestFlight, add your family's
Apple IDs as testers; they install it with the TestFlight app. TestFlight builds last 90 days —
rebuild before then.

## 4. First use

1. Each person installs the app and signs in with their email.
2. Allow location **"Allow all the time" / "Always"** and notifications.
3. People tab → **+ Add someone** → type their email → Share my location (or Ask to see theirs).
4. They tap **Accept**. You now see each other on the map.

### Android battery tip
Some phones (Samsung, Xiaomi, Oppo, Vivo) kill background apps. Settings → Apps → Jejak → Battery → **Unrestricted**.

## What to know

- Location updates about every 5 minutes or when you move 50 m.
- "Play sound" is instant if the lost phone has the app open; otherwise it plays on the phone's next location update (usually within a few minutes). On iPhone it may be quiet if the phone is on silent.
- Lost mode shows your message and number in a notification on the lost phone — it can't lock the phone (iPhone and Android don't allow that for normal apps).
- It can't find a phone that is switched off or has no internet; you'll see its last known location.
- Free Supabase projects pause after a week with no use. Opening the app regularly keeps it awake; otherwise, un-pause it from the Supabase dashboard.

## Publishing on Play Store / App Store (later)

Both stores review background-location apps closely. Google Play requires a background-location
declaration with a short video showing why it's needed; Apple asks why you need "Always".
Run the Brand and Launch stages first (new name, icon, privacy policy).
