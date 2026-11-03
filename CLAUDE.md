# Sentroh Driver app (Expo)

Driver app for the Sentroh marketplace: app name **Sentroh Driver**, Android/iOS id `com.sentroh.driver`. Backend: `D:\Sentroh\sentroh-platform\apps\marketplace-api`. Read `D:\Sentroh\sentroh-platform\docs\PROJECT_STATE.md` first. Main line: `main`; work on `feature/...` branches.

## Stack
- Expo SDK 57, React Native 0.86, expo-router (screens in `app/`), JavaScript (JSX), path alias `@/` = repo root. Same structure as the store app (`sentroh-merchant`).
- State: zustand. `lib/session.js` (sign-in + driver profile), `lib/driver.js` (online, open offer, active jobs, location sending).
- Supabase JS only for phone sign-in (OTP) and uploading the proof-of-delivery photo to a one-time link. Everything else goes through marketplace-api `/api/v1/driver/*` (`lib/api.js`, `driverApi`).
- Location: foreground only at launch. While online, the app sends the position every 30 s (every 10 s during a delivery). Drivers keep the app open while online.
- Navigation: buttons open Google Maps or Waze (free); no map SDK or key in the app.
- Push: expo-notifications, token saved with app `DRIVER`; Android channels `offers` (delivery offers), `urgent` and `default` must match the server's `channelId`.
- Env var names: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MARKETPLACE_API_URL` (DEV only; emulator uses `http://10.0.2.2:4000`).

## Screens
- Sign-in (SMS code), driver sign-up (name, vehicle, plate; an admin approves).
- Tabs: Drive (online switch, offer card with a 30 s countdown, current deliveries), Earnings (today, 7 days, cash to hand in, deliveries, handovers), Account.
- Delivery (`app/job/[jobId].jsx`): store → picked up → at the customer (GPS) → photo + payment (cash/GCash with reference) → delivered; call the customer (calls are logged); failed after the waiting time and calls.

## Hard rules
- NEVER read, print or commit `.env*`, google-services.json, FCM keys or keystores.
- `EXPO_PUBLIC_*` values ship inside the app: never a service-role key or any secret.
- The server decides everything (offers, steps, pay, cash to hand in). The app only shows and asks.
- Do not touch production. Commit files by name, never `git add .`. Push only after the owner says yes.

## Money
- For delivery orders the customer pays the driver. The driver keeps `driverPay` (80% of the delivery fee, a platform setting) and hands Sentroh the rest; admins record each handover.
