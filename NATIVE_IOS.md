# GuildWright iOS (Capacitor), build and publish

The Android notes are in `NATIVE_ANDROID.md`. This is the iOS side. `@capacitor/ios` is installed;
the `ios/` project itself has to be created on the Mac, because CocoaPods only runs on macOS.

Bundle id is **`com.guildwright.app`**, the same as Android, from `capacitor.config.json`.

## Before you start

Enroll in the Apple Developer Program as an **Organization**, not an Individual. Refuge & Sword
Publishing LLC is a legal entity, and Apple rejects apps from entities enrolled as individuals.
$99 a year.

That needs a **D-U-N-S number** for the LLC, free from Dun & Bradstreet, and Apple matches the
legal entity name against the D&B record exactly. Start that first; it gates everything and can
take days.

## First build, on the Mac

```
git clone <repo> && cd guildwright
npm install
npm run build          # produce dist/
npx cap add ios        # creates ios/ and installs pods. macOS only
npx cap open ios       # opens Xcode
```

After any web change: `npm run build && npx cap sync ios`. The web assets are bundled, so a web
change does not reach the app until you sync and rebuild. This has caught us twice on Android.

## Info.plist usage strings, required

iOS refuses the permission and the App Store rejects the build if a usage string is missing. Add
these in Xcode under the target's Info tab. Wording matters: it is shown verbatim in the system
prompt and reviewers read it.

| Key | String |
|---|---|
| `NSLocationWhenInUseUsageDescription` | Your location is recorded when you clock in and out, to confirm the shift happened at the job site. Your company's owners and administrators can see it on your timecard. |
| `NSCameraUsageDescription` | Take a photo of a receipt to attach it to a job expense. |
| `NSPhotoLibraryUsageDescription` | Attach a saved photo of a receipt to a job expense. |
| `NSPhotoLibraryAddUsageDescription` | Save a captured receipt photo to your library. |

Do **not** add `NSLocationAlwaysAndWhenInUseUsageDescription`. The app never needs background
location, and asking for it invites review questions it cannot answer.

## What already works on iOS

`isNativePlatform()` is true on iOS as well as Android, so the billing changes made for Google Play
apply here unchanged: the plan picker, checkout buttons and billing portal link are all hidden, and
nothing is sold inside the app. That satisfies Apple's guideline 3.1.1 the same way it satisfies
Play's payments policy.

Account deletion is also an Apple requirement, guideline 5.1.1(v), and it is already built: the
in-app request under Settings, Your account, plus guildwright.app/delete-account.

## App Store Connect

- **Privacy nutrition labels** ask the same questions as Play's data safety form. Reuse the answers
  in `docs/play-store-handoff.md`: precise location, photos, files, messages, financial info,
  diagnostics and device identifiers, all collected, none shared, none used for tracking.
- **Account deletion URL**: https://guildwright.app/delete-account
- **Privacy policy URL**: https://guildwright.app/privacy
- **App icon**: use `public/appstore-icon-1024.png`, already flattened. `public/icon1024.png` has an
  alpha channel, which App Store Connect rejects; the flattened copy sits on the same dark ground
  (#262525) the Android adaptive icon uses.
- **Screenshots**: 6.7 inch (1290x2796) and 6.5 inch (1284x2778) are the sizes Apple asks for.
  `scripts/store-screenshots.mjs` takes a viewport, so it can produce these; the Play set is 9:16
  and the wrong shape here.
- **Demo account** for review: playreview@guildwright.app, the same seeded tenant used for Play.
  Apple reviewers always sign in, so this is not optional.

## Where iOS will differ from Android

Worth testing on a real device rather than assuming, since this is a webview app:

- Safe area insets around the notch and home indicator
- Camera capture and HEIC conversion for receipts
- Geolocation permission timing, since the disclosure fires before the OS prompt
- Push notifications, which need an APNs key in the Apple Developer account and Firebase
  configured for iOS, separate from the Android `google-services.json`
