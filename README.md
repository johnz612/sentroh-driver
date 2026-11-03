# Sentroh Driver

Expo app for Sentroh delivery drivers: go online, accept offers, deliver, see earnings.

## Run on the Android emulator (DEV)
1. `npm install` (then `npx expo install --fix` to match Expo SDK 57).
2. Copy `env.example` to `.env` and fill in the DEV values (never production).
3. Start the API (`npm run dev:api` in sentroh-platform).
4. `npx expo start -c` and open it on the emulator.
   For push alerts and the camera you need a development build on a real phone (`eas build --profile development`).

Drivers need an approved account: sign in, send the application, then approve it in the Sentroh Web Admin (Drivers).
