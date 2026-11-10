# PMP Exam Simulator

A voice-based PMP exam prep app built around original situational questions and spoken practice.

## What it does

- 253 original situational questions across the three PMP domains, weighted to the current exam blueprint: People 33%, Process 41%, Business Environment 26%
- Every question and explanation is available as recorded audio, and answers can be given by voice or by tap
- A 122-term glossary with audio, including commonly confused term pairs
- Practice sets, a process chart drill, and formula drills
- Mock exams of up to 180 questions
- Weak-area tracking that ranks domains and topics by accuracy so study time goes where it is needed

## Tech notes

- Client: React and TypeScript (`client/src`), built with Vite into a static bundle in `dist/`
- Fully standalone and offline: the question bank and glossary ship inside the client bundle (`client/src/data`), the practice and scoring logic runs in the browser (`client/src/local`), and progress and sessions persist in localStorage on the device. There is no server and no account.
- Audio: 628 recorded MP3 files for questions, explanations, and glossary terms live under `client/src/assets/audio/` and are emitted into `dist/assets/` at build time
- iOS: Capacitor wraps the `dist/` output (see `capacitor.config.ts` and MAC-SETUP.md)

## Standalone build

Requires Node.js (a current LTS release) and npm.

1. `npm install`
2. `npm run build` (production bundle lands in `dist/`; serve that folder with any static host, or use `npm run preview` to check it locally)
3. `npm run dev` for the local development server, `npm run typecheck` for the TypeScript check

To wrap the app for iOS on a Mac with Xcode, follow the numbered steps in [MAC-SETUP.md](MAC-SETUP.md).

## About

Built by Christian Talavera as a personal study tool while preparing for the PMP exam. It is now being prepared for wider release.
