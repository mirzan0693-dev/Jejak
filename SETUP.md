# Jejak — setup guide

Everything here is free except the Apple developer account (only needed for iPhone).
Steps 1–2 work on your phone's browser. Step 3 needs your computer.

## 1. Create the database (Supabase, free) — ~5 min

1. Go to https://supabase.com → Start your project → sign in with GitHub or email.
2. New project → name it `jejak`, choose region **Southeast Asia (Singapore)**, set a database password (save it somewhere), Create.
3. When it's ready: left menu → **SQL Editor** → New query → paste the whole of `supabase/schema.sql` → **Run**. It should say "Success".
4. Left menu → **Authentication → Sign In / Providers → Email**: make sure Email is enabled.
5. **Authentication → Emails → Magic Link** template: change the body so it shows the code, e.g.
   `Your Jejak code is {{ .Token }}` → Save. (The app signs in with a code, not a link.)
6. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

## 2. Put your keys in the app

Open `eas.json` and replace both `PASTE_YOUR_SUPABASE_URL` and both `PASTE_YOUR_SUPABASE_ANON_KEY` with the values from step 1.6.
(The anon key is safe to put in the app — the database rules decide what each person can see.)

## 3. Build the app (EAS, free tier) — on your computer

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
