// Local persistence for the standalone build.
//
// The hosted version kept two SQLite tables on the server, sessions and
// attempts, with autoincrement ids and millisecond timestamps. This module
// keeps the same row shapes in a single localStorage record so the ported
// action logic in ./actions.ts reads and writes exactly the way the
// original did. Progress is per device and per browser, never leaves the
// device, and resetProgress simply clears the record's rows. The id
// counters are never rewound, matching SQLite AUTOINCREMENT behavior
// after a plain DELETE.

import type { DomainKey } from "../data/bank";
import type { AnswerMode, QuestionKind, SessionKind } from "./types";

export interface SessionRow {
  id: number;
  kind: SessionKind;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  completedAt: string | null;
  createdAt: string;
}

export interface AttemptRow {
  id: number;
  sessionId: number;
  questionId: string;
  kind: QuestionKind;
  domain: DomainKey;
  topic: string;
  processGroup: string | null;
  chosenIndex: number;
  isCorrect: 0 | 1;
  answerMode: AnswerMode;
  createdAt: string;
}

export interface StoreShape {
  version: 1;
  nextSessionId: number;
  nextAttemptId: number;
  sessions: SessionRow[];
  attempts: AttemptRow[];
}

const STORAGE_KEY = "pmp-exam-simulator.store.v1";

function emptyStore(): StoreShape {
  return {
    version: 1,
    nextSessionId: 1,
    nextAttemptId: 1,
    sessions: [],
    attempts: [],
  };
}

export function loadStore(): StoreShape {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.sessions) ||
      !Array.isArray(parsed.attempts) ||
      typeof parsed.nextSessionId !== "number" ||
      typeof parsed.nextAttemptId !== "number"
    ) {
      return emptyStore();
    }
    return parsed as StoreShape;
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: StoreShape): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage can be unavailable (private mode, quota). The session in
    // progress still works from the in-memory return values; only the
    // cross-session history would be lost, same as a cleared browser.
  }
}
