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

- Client: React and TypeScript (`client/src`), built with the script in `client/build.mjs`
- Server: TypeScript server actions (`server/src`) with a Drizzle ORM schema over SQLite (`drizzle/` holds the migrations)
- Audio: 628 recorded MP3 files for questions, explanations, and glossary terms live under `client/src/assets/audio/` in the full source tree

## About

Built by Christian Talavera as a personal study tool while preparing for the PMP exam. It is now being prepared for wider release.
