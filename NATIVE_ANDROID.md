# GuildWright Android (Capacitor) — build & publish

The native Android shell wraps the web app (bundled `dist`, so the UI works offline; data syncs with
Supabase when online). appId is **`com.guildwright.app`** (in `capacitor.config.json`). This id is
permanent once the app is on Google Play, so change it now if you want a different one.

## What's already set up
- Capacitor 8 installed (`@capacitor/core`, `cli`, `android`) plus plugins: `app`, `geolocation`,
  `push-notifications`, `splash-screen`.
- `android/` native Gradle project scaffolded, web assets bundled.
- npm scripts: `npm run cap:sync` (build web + copy into native), `npm run cap:open` (open Android Studio).

## Prerequisites (your machine)
- **Android Studio** (latest) with the Android SDK.
- **JDK 21** (already present in this repo's toolchain).

## Build & run locally
1. `npm run cap:sync`  — builds the web app and copies it into the native project.
2. `npm run cap:open`  — opens the project in Android Studio.
3. In Android Studio: pick a device/emulator and Run. That installs a debug build to verify the app.

Re-run `npm run cap:sync` after any web change to refresh the bundled assets.

## Native push (FCM) — the one real integration to finish
The web app uses VAPID web push through a service worker. On native Android, that path is unreliable;
native push needs **Firebase Cloud Messaging (FCM)**:
1. Create a Firebase project, add an Android app with appId `com.guildwright.app`, download
   `google-services.json` into `android/app/`.
2. Register the FCM token from `@capacitor/push-notifications` and store it server-side (extend the
   existing push subscriptions), then have the send-push edge function deliver to FCM tokens too.
This is the one meaningful code task remaining for full parity; the rest of the app already runs.

## Location
`navigator.geolocation` works inside the Capacitor webview for the clock-in geofence today. For
background/always location, switch the clock-in path to `@capacitor/geolocation`. The plugin already
declares the location permissions in the merged manifest.

## Publish to Google Play
1. **Google Play Console** account (one-time $25).
2. **App signing:** use Play App Signing. In Android Studio: Build → Generate Signed Bundle/APK →
   Android App Bundle (`.aab`); create/keep an upload keystore safe.
3. **Store listing:** app name (GuildWright), short + full description, app icon (use the HD icon),
   feature graphic (1024×500), phone screenshots (the product screenshots in the marketing site work),
   category (Business), and the **privacy policy URL: https://guildwright.app/privacy**.
4. **Data safety** form + **content rating** questionnaire.
5. Upload the `.aab` to a testing track (internal/closed) first, then production. Review is typically
   a few days for a new app.

## Notes
- The bundled-assets approach means web updates ship via a new app release. If you want instant web
  updates later, we can switch to a live-URL or add an OTA update channel.
