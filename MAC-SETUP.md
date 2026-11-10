# Mac setup: wrap PMP Exam Simulator for iOS and ship it

Everything below runs on your Mac. The app itself is finished: the web build is standalone and offline, and these steps only create the native iOS shell around it, test it on your phone, and walk it through TestFlight to the App Store.

## Prerequisites

1. Install Xcode from the Mac App Store, then open it once and let it finish installing its components.
2. Install Node.js (a current LTS release) from nodejs.org, which includes npm.
3. Have your Apple Developer account ready (the paid program membership is required for TestFlight and App Store submission).
4. Get this repository onto the Mac (clone it or copy the folder) and open a Terminal window in the repository root, the folder that contains package.json.

## Build the web app

5. Run `npm install` and let it finish. This installs everything, including Capacitor.
6. Run `npm run build`. The production bundle lands in `dist/`. If you want a quick sanity check in a browser first, run `npm run preview` and open the address it prints.
7. Run `npm run typecheck` if you want the TypeScript check as well. It should complete with no errors.

## Create the iOS shell

8. Run `npx cap add ios`. This generates the native Xcode project in a new `ios/` folder from capacitor.config.ts (app id com.finityo.pmpexamsimulator, app name PMP Exam Simulator). You only run this once; if the `ios/` folder already exists, skip this step.
9. Run `npx cap sync`. This copies the fresh `dist/` build into the iOS project and updates the native plugins. Re-run it after every `npm run build` so the app on the phone always matches the latest web build. (The `npm run cap:sync` script in package.json does the build and the sync in one go.)
10. Open the project in Xcode with `npx cap open ios`, or by double clicking `ios/App/App.xcworkspace` if one is generated, otherwise `ios/App/App.xcodeproj`.

## Signing

11. In Xcode, select the App target, then the Signing and Capabilities tab.
12. Check "Automatically manage signing" and choose your Apple Developer team. Xcode will create the signing certificate and provisioning profile for the app id.
13. Confirm the bundle identifier reads com.finityo.pmpexamsimulator. If Xcode reports the id is unavailable, the id may already be registered under your account, which is fine; follow the prompt to register it there.

## App icon

14. The App Store icon must be a 1024 by 1024 pixel PNG with no transparency (no alpha channel). The repo root has icon.webp, which is the source art but not in the format Xcode needs.
15. Convert it before adding it: open icon.webp in Preview, export or duplicate it as a PNG at 1024 by 1024, and make sure the export flattens it (PNG with alpha unchecked, or place it on a solid background first so there is no transparency).
16. In Xcode, open Assets.xcassets, select AppIcon, and drag the 1024 PNG into the App Store / universal icon slot. Xcode derives the smaller sizes from it.

## Privacy manifest

17. Capacitor generates a baseline privacy manifest (PrivacyInfo.xcprivacy) for the app, which covers what the shell itself uses.
18. This app's own position is simple and true: progress and session data are stored only on the device in the app's local storage, there are no accounts, no analytics, and no tracking, and the app collects no data. When App Store Connect asks its privacy questions during submission, answer accordingly (Data Not Collected), and do not add any tracking declarations.

## First run on your phone: test voice answering first

19. Connect your iPhone to the Mac, select it as the run destination in Xcode, and press Run. The app installs and opens on the phone.
20. First thing, before anything else: start a practice set and test voice answering. Voice answering uses the browser speech recognition built into the web view, and inside the iOS WKWebView that Capacitor uses it may be limited or unavailable. This is a known risk, not a surprise failure.
21. Confirm the fallback either way: tap to answer must work fully, every question must play its recorded audio, and a full practice set and a short mock exam must score and save. Those paths do not depend on speech recognition.
22. If voice answering does not work in the shell, the app is still complete and shippable with tap answering; voice input can be revisited later with a native speech plugin. Do not let it block the first TestFlight build.

## TestFlight

23. In Xcode, set the run destination to "Any iOS Device" (or the generic device option), then choose Product, Archive.
24. When the Organizer window opens, select the archive and click Distribute App, then App Store Connect, then Upload, and follow the prompts with the defaults.
25. In App Store Connect (appstoreconnect.apple.com), open the app record, go to TestFlight, and wait for the build to finish processing. Answer the export compliance question when it appears (the app uses no custom encryption, so the standard answer applies).
26. Add yourself as an internal tester, install TestFlight on your phone, and install the build. Run through one practice set, one mock exam, the glossary audio, and a progress reset on the real device.

## App Store submission

27. In App Store Connect, complete the app listing: name PMP Exam Simulator, subtitle and description, category (Education), support and privacy policy URLs, and the privacy answers from step 18 (Data Not Collected).
28. Add screenshots from the phone build (the App Store requires at least the current large iPhone size set) and set pricing and availability.
29. Select the TestFlight build you validated, add notes for the reviewer explaining that the app is a self contained study tool with no account and no login, and submit for review.
30. After approval, release manually or automatically as you prefer. For later updates: change the web app, run `npm run build`, run `npx cap sync`, raise the build number in Xcode, and repeat steps 23 to 26 and 29.
