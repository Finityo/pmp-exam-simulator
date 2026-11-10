import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hero } from "./components/Hero";
import { SafeAreaTopScrim } from "./components/SafeAreaTopScrim";
import { api, type ApiResponse } from "./api";
import { explanationAudio, questionAudio } from "./audioMap";
import { glossaryAudio } from "./glossaryAudio";

type SessionData = ApiResponse<typeof api, "startSession">;
type Question = SessionData["questions"][number];
type AnswerResult = ApiResponse<typeof api, "submitAnswer">;
type FinishData = ApiResponse<typeof api, "finishSession">;
type GlossaryData = ApiResponse<typeof api, "getGlossary">;
type GlossaryTerm = GlossaryData["terms"][number];

type View = "home" | "practice" | "results" | "chart" | "gap" | "glossary" | "audit";

const DOMAIN_NAMES: Record<string, string> = {
  people: "People",
  process: "Process",
  business: "Business Environment",
};

const PROCESS_GROUP_ORDER = [
  "Initiating",
  "Planning",
  "Executing",
  "Monitoring and Controlling",
  "Closing",
];

const DOMAIN_COLORS: Record<string, string> = {
  people: "var(--people)",
  process: "var(--process)",
  business: "var(--business)",
};

const LETTERS = ["A", "B", "C", "D"];

const FORMAT_LABELS: Record<string, string> = {
  next: "What happens NEXT",
  avoid: "How to AVOID it",
  best: "Best action",
  first: "First step",
  formula: "Calculate it",
};

const SESSION_KIND_LABELS: Record<string, string> = {
  scenario: "Scenario practice",
  chart: "Process chart drill",
  formula: "Formula drill",
  mock: "Mock exam",
};

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function mockMinutes(size: number): number {
  return Math.round((size * 230) / 180);
}

const CHART_REFERENCE: { group: string; processes: string[] }[] = [
  {
    group: "Initiating",
    processes: ["Develop Project Charter", "Identify Stakeholders"],
  },
  {
    group: "Planning",
    processes: [
      "Develop Project Management Plan",
      "Collect Requirements",
      "Define Scope and Create WBS",
      "Define and Sequence Activities",
      "Estimate Durations, Costs, and Budget",
      "Plan Quality, Resources, and Communications",
      "Plan Risk Management and Identify Risks",
      "Plan Procurements",
      "Plan Stakeholder Engagement",
    ],
  },
  {
    group: "Executing",
    processes: [
      "Direct and Manage Project Work",
      "Manage Quality",
      "Acquire, Develop, and Manage Team",
      "Manage Communications",
      "Conduct Procurements",
      "Manage Stakeholder Engagement",
    ],
  },
  {
    group: "Monitoring and Controlling",
    processes: [
      "Monitor and Control Project Work",
      "Perform Integrated Change Control",
      "Validate Scope and Control Scope",
      "Control Schedule and Control Costs",
      "Control Quality and Control Resources",
      "Monitor Communications and Monitor Risks",
      "Control Procurements",
      "Monitor Stakeholder Engagement",
    ],
  },
  {
    group: "Closing",
    processes: ["Close Project or Phase"],
  },
];

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechResultEventLike {
  results: ArrayLike<{
    isFinal: boolean;
    [index: number]: { transcript: string };
    length: number;
  }>;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  const ctor = (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  return ctor ?? null;
}

function matchSpokenOption(transcript: string, options: string[]): number | null {
  const t = transcript.toLowerCase().trim();
  const letterMatch = t.match(/(?:option|choice|answer|letter)?\s*\b([abcd])\b/);
  if (letterMatch && letterMatch[1]) {
    const idx = "abcd".indexOf(letterMatch[1]);
    if (idx >= 0) return idx;
  }
  const ordinals: Record<string, number> = {
    first: 0,
    "1st": 0,
    second: 1,
    "2nd": 1,
    third: 2,
    "3rd": 2,
    fourth: 3,
    "4th": 3,
    last: options.length - 1,
  };
  for (const [word, idx] of Object.entries(ordinals)) {
    if (new RegExp(`\\b${word}\\b`).test(t) && idx < options.length) return idx;
  }
  let bestIdx: number | null = null;
  let bestScore = 0;
  options.forEach((opt, i) => {
    const words = opt
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4);
    let score = 0;
    for (const w of words) {
      if (t.includes(w)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });
  return bestScore >= 2 ? bestIdx : null;
}

function LevelBars({ active }: { active: boolean }) {
  const heights = [14, 22, 10, 26, 16, 24, 12, 20];
  return (
    <span className="flex items-center gap-[3px]" aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={i}
          className={active ? "level-bar" : ""}
          style={{
            display: "inline-block",
            width: 3,
            height: h,
            borderRadius: 2,
            background: "currentColor",
            opacity: active ? 1 : 0.45,
            animationDelay: `${i * 0.09}s`,
          }}
        />
      ))}
    </span>
  );
}

function PlayButton({
  playing,
  onToggle,
  label,
  size = 76,
}: {
  playing: boolean;
  onToggle: () => void;
  label: string;
  size?: number;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onToggle}
      className="flex shrink-0 items-center justify-center rounded-full font-display"
      style={{
        width: size,
        height: size,
        background: "var(--accent-strong)",
        color: "#ffffff",
        boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
      }}
    >
      {playing ? (
        <span className="flex gap-[6px]" aria-hidden="true">
          <span style={{ width: 7, height: 26, background: "currentColor", borderRadius: 2 }} />
          <span style={{ width: 7, height: 26, background: "currentColor", borderRadius: 2 }} />
        </span>
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 0,
            height: 0,
            borderTop: "13px solid transparent",
            borderBottom: "13px solid transparent",
            borderLeft: "22px solid currentColor",
            marginLeft: 6,
          }}
        />
      )}
    </button>
  );
}

function TermBadges({ term }: { term: GlossaryTerm }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span
        className="rounded-full px-2.5 py-0.5 text-xs font-bold"
        style={{ background: DOMAIN_COLORS[term.domain] ?? "var(--accent)", color: "var(--on-domain)" }}
      >
        {DOMAIN_NAMES[term.domain] ?? term.domain}
      </span>
      {term.processGroup ? (
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ background: "var(--surface2)", color: "var(--dim)" }}
        >
          {term.processGroup}
        </span>
      ) : null}
      {term.confusedWith ? (
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold"
          style={{ background: "var(--bad)", color: "#fff" }}
        >
          Easily confused
        </span>
      ) : null}
    </span>
  );
}

function TermBody({
  term,
  playing,
  onToggleAudio,
}: {
  term: GlossaryTerm;
  playing: boolean;
  onToggleAudio: (term: GlossaryTerm) => void;
}) {
  return (
    <div>
      <p className="text-base leading-relaxed">{term.definition}</p>
      {term.confusedWith ? (
        <div className="mt-3 rounded-[var(--radius)] p-3" style={{ background: "var(--surface2)" }}>
          <p className="text-sm">
            <span className="font-display font-bold" style={{ color: "var(--bad)" }}>
              Often confused with {term.confusedWith}.{" "}
            </span>
            {term.trapNote ?? "Check the exam trap note in the glossary for how the exam separates them."}
          </p>
        </div>
      ) : term.trapNote ? (
        <div className="mt-3 rounded-[var(--radius)] p-3" style={{ background: "var(--surface2)" }}>
          <p className="text-sm">
            <span className="font-display font-bold" style={{ color: "var(--accent)" }}>
              Exam trap:{" "}
            </span>
            {term.trapNote}
          </p>
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-3">
        <PlayButton
          size={44}
          playing={playing}
          onToggle={() => onToggleAudio(term)}
          label={playing ? `Stop reading ${term.term}` : `Listen to ${term.term} and its definition`}
        />
        <p className="text-sm font-semibold" style={{ color: "var(--dim)" }}>
          {playing ? "Reading the term aloud..." : "Listen to this term"}
        </p>
      </div>
    </div>
  );
}

function TermLookup({
  label,
  termIds,
  termsById,
  openTermId,
  onToggleTerm,
  playingKey,
  onToggleAudio,
}: {
  label: string;
  termIds: string[];
  termsById: Map<string, GlossaryTerm>;
  openTermId: string | null;
  onToggleTerm: (id: string) => void;
  playingKey: string | null;
  onToggleAudio: (term: GlossaryTerm) => void;
}) {
  const terms = termIds
    .map((id) => termsById.get(id))
    .filter((t): t is GlossaryTerm => t !== undefined);
  if (terms.length === 0) return null;
  const open = openTermId ? termsById.get(openTermId) : undefined;
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold" style={{ color: "var(--dim)" }}>
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {terms.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onToggleTerm(t.id)}
            aria-expanded={openTermId === t.id}
            className="rounded-full px-3.5 py-2 text-sm font-semibold"
            style={{
              background: openTermId === t.id ? "var(--accent-strong)" : "var(--surface2)",
              color: openTermId === t.id ? "#ffffff" : "var(--text)",
              border: "1px solid var(--border)",
            }}
          >
            {t.term}
          </button>
        ))}
      </div>
      {open && terms.some((t) => t.id === open.id) ? (
        <div
          className="mt-3 rounded-[var(--radius)] p-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-lg font-bold">{open.term}</p>
            <TermBadges term={open} />
          </div>
          <div className="mt-2">
            <TermBody term={open} playing={playingKey === `g-${open.id}`} onToggleAudio={onToggleAudio} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DomainBar({
  name,
  weight,
  accuracy,
  attempted,
  isWeakest,
  color,
}: {
  name: string;
  weight: number;
  accuracy: number | null;
  attempted: number;
  isWeakest: boolean;
  color: string;
}) {
  return (
    <div
      className="rounded-[var(--radius)] p-4"
      style={{
        background: "var(--surface)",
        border: isWeakest ? "2px solid var(--bad)" : "1px solid var(--border)",
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-base font-semibold">
          {name}
          {isWeakest && attempted > 0 ? (
            <span
              className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ background: "var(--bad)", color: "#fff" }}
            >
              Weakest
            </span>
          ) : null}
        </p>
        <p className="text-sm" style={{ color: "var(--dim)" }}>
          Exam weight {weight}%
        </p>
      </div>
      <div
        className="mt-3 h-3 w-full overflow-hidden rounded-full"
        style={{ background: "var(--surface2)" }}
        role="img"
        aria-label={`${name} accuracy ${accuracy === null ? "no attempts yet" : `${accuracy} percent`}`}
      >
        <div
          style={{
            width: `${accuracy ?? 0}%`,
            height: "100%",
            background: color,
            borderRadius: 999,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <p className="mt-2 text-sm" style={{ color: "var(--dim)" }}>
        {attempted === 0
          ? "No answers yet in this domain."
          : `${accuracy}% correct from ${attempted} answer${attempted === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}

export function App() {
  const queryClient = useQueryClient();
  const [heroDismissed, setHeroDismissed] = useState(false);
  const [view, setView] = useState<View>("home");
  const [sessionSize, setSessionSize] = useState(10);
  const [session, setSession] = useState<SessionData | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [summary, setSummary] = useState<FinishData | null>(null);
  const [listening, setListening] = useState(false);
  const [voicePending, setVoicePending] = useState<{ index: number; transcript: string } | null>(null);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [mockSize, setMockSize] = useState(50);
  const [mockAnswers, setMockAnswers] = useState<Record<string, { index: number; mode: "tap" | "voice" }>>({});
  const [mockFlags, setMockFlags] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(0);
  const [confirmFinishMock, setConfirmFinishMock] = useState(false);
  const [mockSubmitting, setMockSubmitting] = useState(false);
  const [mockSubmitted, setMockSubmitted] = useState(false);
  const [mockSubmitNote, setMockSubmitNote] = useState<string | null>(null);
  const [openTermId, setOpenTermId] = useState<string | null>(null);
  const [glossarySearch, setGlossarySearch] = useState("");
  const [glossaryGroupMode, setGlossaryGroupMode] = useState<"domain" | "group" | "pairs">("domain");

  const mockSubmittedIds = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.getOverview({}),
  });

  const glossary = useQuery({
    queryKey: ["glossary"],
    queryFn: () => api.getGlossary({}),
  });

  const bankAudit = useQuery({
    queryKey: ["bankAudit"],
    queryFn: () => api.getBankAudit({}),
  });

  const termsById = new Map<string, GlossaryTerm>(
    (glossary.data?.terms ?? []).map((t) => [t.id, t]),
  );

  const toggleTermAudio = (term: GlossaryTerm) => {
    playAudio(glossaryAudio[term.id], `g-${term.id}`);
  };

  const toggleOpenTerm = (id: string) => {
    setOpenTermId((cur) => (cur === id ? null : id));
  };

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const onTime = () => {
      if (audio.duration > 0) setProgress(audio.currentTime / audio.duration);
    };
    const onEnd = () => {
      setPlayingKey(null);
      setProgress(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  const stopAudio = () => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setPlayingKey(null);
    setProgress(0);
  };

  const playAudio = (src: string | undefined, key: string) => {
    const a = audioRef.current;
    if (!a || !src) return;
    if (playingKey === key) {
      stopAudio();
      return;
    }
    a.src = src;
    setPlayingKey(key);
    setProgress(0);
    void a.play().catch(() => setPlayingKey(null));
  };

  const startMutation = useMutation({
    mutationFn: (args: { kind: "scenario" | "chart" | "formula" | "mock"; size: number }) =>
      api.startSession(args),
    onSuccess: (data) => {
      setSession(data);
      setQIndex(0);
      setResult(null);
      setChosen(null);
      setSessionCorrect(0);
      setSummary(null);
      setVoicePending(null);
      setVoiceNote(null);
      setMockAnswers({});
      setMockFlags(new Set());
      setTimeLeft(data.durationSeconds);
      setConfirmFinishMock(false);
      setMockSubmitting(false);
      setMockSubmitted(false);
      mockSubmittedIds.current = new Set();
      setMockSubmitNote(null);
      setView("practice");
    },
  });

  const submitMutation = useMutation({
    mutationFn: (args: {
      sessionId: number;
      questionId: string;
      chosenIndex: number;
      answerMode: "tap" | "voice";
    }) => api.submitAnswer(args),
    onSuccess: (data) => {
      setResult(data);
      if (data.correct) setSessionCorrect((c) => c + 1);
    },
  });

  const finishMutation = useMutation({
    mutationFn: (sessionId: number) => api.finishSession({ sessionId }),
    onSuccess: (data) => {
      setSummary(data);
      setView("results");
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: () => {
      setMockSubmitting(false);
      setMockSubmitNote(
        "Scoring did not complete. If your answers were already submitted, finishing again only retries the scoring.",
      );
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => api.resetProgress({}),
    onSuccess: () => {
      setConfirmReset(false);
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  const current: Question | undefined = session?.questions[qIndex];

  useEffect(() => {
    if (view !== "practice" || !current) return;
    setResult(null);
    setChosen(null);
    setVoicePending(null);
    setVoiceNote(null);
    setOpenTermId(null);
    const src = questionAudio[current.id];
    const a = audioRef.current;
    if (a && src) {
      const t = setTimeout(() => {
        a.src = src;
        setPlayingKey(`q-${current.id}`);
        setProgress(0);
        void a.play().catch(() => setPlayingKey(null));
      }, 350);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, qIndex, session?.sessionId]);

  const isMock = session?.kind === "mock";

  const submitChoice = (index: number, mode: "tap" | "voice") => {
    if (!session || !current || result || submitMutation.isPending) return;
    if (isMock) {
      // Mock exam: selecting an answer only records it locally. Nothing
      // is scored and nothing is revealed until the exam is finished.
      setMockAnswers((prev) => ({ ...prev, [current.id]: { index, mode } }));
      setVoicePending(null);
      setVoiceNote(null);
      return;
    }
    stopAudio();
    setChosen(index);
    submitMutation.mutate({
      sessionId: session.sessionId,
      questionId: current.id,
      chosenIndex: index,
      answerMode: mode,
    });
  };

  const finishMock = async () => {
    if (!session || session.kind !== "mock" || mockSubmitting) return;
    stopAudio();
    setMockSubmitting(true);
    setMockSubmitNote("Submitting your answers...");
    try {
      if (!mockSubmitted) {
        for (const q of session.questions) {
          const a = mockAnswers[q.id];
          if (a && !mockSubmittedIds.current.has(q.id)) {
            await api.submitAnswer({
              sessionId: session.sessionId,
              questionId: q.id,
              chosenIndex: a.index,
              answerMode: a.mode,
            });
            mockSubmittedIds.current.add(q.id);
          }
        }
        setMockSubmitted(true);
      }
      finishMutation.mutate(session.sessionId);
    } catch {
      setMockSubmitting(false);
      setMockSubmitNote("Submitting ran into a problem. Your answers are still on this screen. Try finishing again.");
    }
  };

  useEffect(() => {
    if (view !== "practice" || !session || session.kind !== "mock" || mockSubmitting) return;
    if (timeLeft <= 0) return;
    const t = setTimeout(() => setTimeLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [view, session, timeLeft, mockSubmitting]);

  useEffect(() => {
    if (
      view === "practice" &&
      session?.kind === "mock" &&
      timeLeft === 0 &&
      session.durationSeconds > 0 &&
      !mockSubmitting &&
      !finishMutation.isPending
    ) {
      setMockSubmitNote("Time is up. Submitting your exam...");
      void finishMock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, view, session?.sessionId]);

  const startListening = () => {
    if (!current || result) return;
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setVoiceNote("Voice answering is not available in this browser. Tap an answer instead, it counts the same way.");
      return;
    }
    stopAudio();
    setVoiceNote(null);
    setVoicePending(null);
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.continuous = false;
    setListening(true);
    rec.onresult = (event) => {
      const first = event.results[0];
      if (!first) return;
      let matched: number | null = null;
      let heard = "";
      for (let i = 0; i < first.length; i++) {
        const alt = first[i];
        if (!alt) continue;
        if (!heard) heard = alt.transcript;
        matched = matchSpokenOption(alt.transcript, current.options);
        if (matched !== null) {
          heard = alt.transcript;
          break;
        }
      }
      if (matched !== null) {
        setVoicePending({ index: matched, transcript: heard });
      } else {
        setVoiceNote(
          heard
            ? `Heard: "${heard}". That did not match an option clearly. Say the letter, for example "Option B", or tap an answer.`
            : "Nothing was heard clearly. Try again or tap an answer.",
        );
      }
    };
    rec.onerror = (e) => {
      setListening(false);
      setVoiceNote(
        e.error === "not-allowed"
          ? "Microphone access was blocked. You can allow it in your browser settings, or tap an answer instead."
          : "Voice answering ran into a problem. Tap an answer instead, it counts the same way.",
      );
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
    } catch {
      setListening(false);
      setVoiceNote("Voice answering could not start. Tap an answer instead.");
    }
  };

  const goNext = () => {
    if (!session) return;
    stopAudio();
    if (qIndex + 1 >= session.questions.length) {
      finishMutation.mutate(session.sessionId);
    } else {
      setQIndex((i) => i + 1);
    }
  };

  const leaveSession = () => {
    stopAudio();
    setSession(null);
    setMockAnswers({});
    setMockFlags(new Set());
    setConfirmFinishMock(false);
    setMockSubmitting(false);
    setMockSubmitted(false);
    mockSubmittedIds.current = new Set();
    setMockSubmitNote(null);
    setView("home");
    void queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const toggleMockFlag = (id: string) => {
    setMockFlags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const jumpToQuestion = (i: number) => {
    stopAudio();
    setQIndex(i);
    setVoicePending(null);
    setVoiceNote(null);
    setOpenTermId(null);
  };

  const glossaryTerms = glossary.data?.terms ?? [];
  const searchNorm = glossarySearch.trim().toLowerCase();
  const termMatchesSearch = (t: GlossaryTerm) =>
    !searchNorm ||
    t.term.toLowerCase().includes(searchNorm) ||
    t.definition.toLowerCase().includes(searchNorm) ||
    (t.processGroup ?? "").toLowerCase().includes(searchNorm) ||
    (DOMAIN_NAMES[t.domain] ?? "").toLowerCase().includes(searchNorm);
  const filteredTerms = glossaryTerms.filter(termMatchesSearch);
  const confusedPairs: [GlossaryTerm, GlossaryTerm][] = (() => {
    const seen = new Set<string>();
    const pairs: [GlossaryTerm, GlossaryTerm][] = [];
    for (const t of glossaryTerms) {
      if (!t.confusedWith) continue;
      const partner = glossaryTerms.find((x) => x.term === t.confusedWith);
      if (!partner) continue;
      const key = [t.id, partner.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      if (termMatchesSearch(t) || termMatchesSearch(partner)) pairs.push([t, partner]);
    }
    return pairs;
  })();

  const ov = overview.data;
  const weakestName = ov?.weakestDomain
    ? (ov.domains.find((d) => d.key === ov.weakestDomain)?.name ?? null)
    : null;

  if (!heroDismissed) {
    return <Hero onBegin={() => setHeroDismissed(true)} />;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto w-full max-w-2xl px-4 pb-10">
        {view !== "practice" && view !== "results" && (
          <nav className="flex flex-wrap gap-2 pt-4" aria-label="Sections">
            {(
              [
                ["home", "Practice"],
                ["chart", "Process Chart"],
                ["glossary", "Glossary"],
                ["gap", "Gap Analysis"],
                ["audit", "Bank Audit"],
              ] as [View, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-current={view === v ? "page" : undefined}
                className="rounded-full px-4 py-2 text-sm font-semibold"
                style={{
                  background: view === v ? "var(--accent-strong)" : "var(--surface)",
                  color: view === v ? "#ffffff" : "var(--text)",
                  border: "1px solid var(--border)",
                }}
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        {view === "home" && (
          <section className="pt-5">
            <h1 className="font-display text-3xl font-bold leading-tight">
              Listen. Answer out loud. Learn the trap.
            </h1>
            <p className="mt-2 text-base" style={{ color: "var(--dim)" }}>
              Spoken scenario practice in a situational, exam focused style. Every question is
              read aloud, every answer is explained, and your weak areas are tracked by domain
              at the July 2026 exam weights: People 33%, Process 41%, Business Environment 26%.
              The expansion pack adds 100 new questions, taking the bank to{" "}
              {ov ? ov.mockBankSize : 253} questions, larger than the real 180 question exam,
              and sized so the bank itself now sits almost exactly on the blueprint weights.
              See the Bank Audit page for the full breakdown.
              When you want real conditions, run the timed mock exam below.
            </p>

            {overview.isPending ? (
              <p className="mt-6 text-sm" style={{ color: "var(--dim)" }}>Loading your progress...</p>
            ) : ov ? (
              <>
                <div
                  className="mt-6 rounded-[var(--radius)] p-5"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-sm" style={{ color: "var(--dim)" }}>
                        Weighted score, all time
                      </p>
                      <p className="font-display text-5xl font-bold">
                        {ov.weightedScore === null ? "No data" : `${ov.weightedScore}%`}
                      </p>
                      <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
                        {ov.totalAttempts === 0
                          ? "Answer your first set to start your score."
                          : `${ov.totalCorrect} correct from ${ov.totalAttempts} answers.`}
                        {ov.weightedScore !== null && ov.coveredWeight < 100
                          ? ` Covers ${ov.coveredWeight}% of exam weight so far.`
                          : ""}
                      </p>
                    </div>
                    {weakestName && ov.totalAttempts > 0 ? (
                      <div
                        className="rounded-[var(--radius)] px-4 py-3"
                        style={{ background: "var(--surface2)", border: "1px solid var(--bad)" }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--bad)" }}>
                          Weakest domain
                        </p>
                        <p className="font-display text-xl font-bold">{weakestName}</p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5">
                  <p className="mb-2 text-sm font-semibold" style={{ color: "var(--dim)" }}>
                    Set length
                  </p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Set length">
                    {[10, 20, 30].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSessionSize(n)}
                        aria-pressed={sessionSize === n}
                        className="rounded-full px-5 py-2.5 font-display text-base font-semibold"
                        style={{
                          background: sessionSize === n ? "var(--text)" : "var(--surface)",
                          color: sessionSize === n ? "var(--bg)" : "var(--text)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {n} questions
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-sm" style={{ color: "var(--dim)" }}>
                    {sessionSize === 10
                      ? "Mix at exam weights: People 3, Process 4, Business Environment 3."
                      : sessionSize === 20
                        ? "Mix at exam weights: People 7, Process 8, Business Environment 5."
                        : "Mix at exam weights: People 10, Process 12, Business Environment 8."}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={startMutation.isPending}
                  onClick={() => startMutation.mutate({ kind: "scenario", size: sessionSize })}
                  className="font-display mt-4 flex w-full items-center justify-center gap-3 rounded-[var(--radius)] px-6 py-4 text-lg font-bold"
                  style={{ background: "var(--accent-strong)", color: "#ffffff" }}
                >
                  <LevelBars active={startMutation.isPending} />
                  {startMutation.isPending ? "Preparing your set..." : "Start spoken scenario practice"}
                </button>
                {startMutation.isError ? (
                  <p className="mt-2 text-sm" style={{ color: "var(--bad)" }}>
                    The set could not start. Please try again.
                  </p>
                ) : null}

                <div
                  className="mt-5 rounded-[var(--radius)] p-5"
                  style={{ background: "var(--surface)", border: "2px solid var(--accent-strong)" }}
                >
                  <h2 className="font-display text-xl font-bold">Timed mock exam</h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
                    Real exam conditions, scaled to the current bank of {ov.mockBankSize}{" "}
                    questions. The clock runs at real PMP pacing, 230 minutes for 180
                    questions. You can move between questions, change answers, and flag
                    questions for review, and no answer is scored or explained until you
                    finish. At the end you get a full report: score by domain and by process
                    group, plus a review of every question with its explanation and trap.
                    Unanswered questions count as not correct. The bank now holds more
                    questions than the real exam, so the 180 option matches the real exam
                    length exactly, and the full bank option runs the entire bank.
                  </p>
                  <p className="mb-2 mt-4 text-sm font-semibold" style={{ color: "var(--dim)" }}>
                    Exam length
                  </p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Mock exam length">
                    {[25, 50, 100, 180, ov.mockBankSize].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setMockSize(n)}
                        aria-pressed={mockSize === n}
                        className="rounded-full px-5 py-2.5 font-display text-base font-semibold"
                        style={{
                          background: mockSize === n ? "var(--text)" : "var(--surface)",
                          color: mockSize === n ? "var(--bg)" : "var(--text)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {n === ov.mockBankSize ? `Full bank: ${n}` : `${n} questions`}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-sm" style={{ color: "var(--dim)" }}>
                    Time on the clock: about {mockMinutes(mockSize)} minutes. Mix: scenarios
                    at exam domain weights, plus formula and chart questions in bank
                    proportion.
                  </p>
                  <button
                    type="button"
                    disabled={startMutation.isPending}
                    onClick={() => startMutation.mutate({ kind: "mock", size: mockSize })}
                    className="font-display mt-4 flex w-full items-center justify-center gap-3 rounded-[var(--radius)] px-6 py-4 text-lg font-bold"
                    style={{ background: "var(--accent-strong)", color: "#ffffff" }}
                  >
                    <LevelBars active={startMutation.isPending} />
                    {startMutation.isPending ? "Preparing your exam..." : "Start the mock exam"}
                  </button>
                </div>

                <div
                  className="mt-5 rounded-[var(--radius)] p-5"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <h2 className="font-display text-xl font-bold">Process chart drill</h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
                    Ten spoken prompts that walk the process chart in order: Initiating,
                    Planning, Executing, Monitoring and Controlling, Closing. Know where each
                    process lives and half the exam's process questions get easier.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={startMutation.isPending}
                      onClick={() => startMutation.mutate({ kind: "chart", size: 10 })}
                      className="font-display rounded-full px-5 py-2.5 font-semibold"
                      style={{ background: "var(--text)", color: "var(--bg)" }}
                    >
                      Start chart drill
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("chart")}
                      className="font-display rounded-full px-5 py-2.5 font-semibold"
                      style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)" }}
                    >
                      View the chart
                    </button>
                  </div>
                </div>

                <div
                  className="mt-5 rounded-[var(--radius)] p-5"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <h2 className="font-display text-xl font-bold">Formula drills</h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
                    {ov.formulaBankSize} spoken calculation drills, new in the week one pack:
                    earned value (CPI, SPI, EAC, ETC, VAC, TCPI, and percent complete),
                    three point and PERT estimates, total float and free float, and
                    communication channels. Each explanation works the formula step by step,
                    names the trap, and says what the number means for the project.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={startMutation.isPending}
                      onClick={() => startMutation.mutate({ kind: "formula", size: 13 })}
                      className="font-display rounded-full px-5 py-2.5 font-semibold"
                      style={{ background: "var(--text)", color: "var(--bg)" }}
                    >
                      Start formula drills
                    </button>
                  </div>
                </div>

                <div
                  className="mt-5 rounded-[var(--radius)] p-5"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <h2 className="font-display text-xl font-bold">Glossary</h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
                    {glossary.data
                      ? `${glossary.data.terms.length} core terms in plain language, grouped by domain and process group, with the easily confused pairs flagged and a recording for every term.`
                      : "Core terms in plain language, grouped by domain and process group, with the easily confused pairs flagged and a recording for every term."}{" "}
                    Terms that appear in a question are also one tap away during practice.
                  </p>
                  <button
                    type="button"
                    onClick={() => setView("glossary")}
                    className="font-display mt-3 rounded-full px-5 py-2.5 font-semibold"
                    style={{ background: "var(--text)", color: "var(--bg)" }}
                  >
                    Open the glossary
                  </button>
                </div>

                <h2 className="font-display mt-7 text-xl font-bold">Score by domain</h2>
                <div className="mt-3 grid gap-3">
                  {ov.domains.map((d) => (
                    <DomainBar
                      key={d.key}
                      name={d.name}
                      weight={d.weight}
                      accuracy={d.accuracy}
                      attempted={d.attempted}
                      isWeakest={ov.weakestDomain === d.key}
                      color={DOMAIN_COLORS[d.key] ?? "var(--accent)"}
                    />
                  ))}
                </div>

                {ov.recentSessions.length > 0 ? (
                  <>
                    <h2 className="font-display mt-7 text-xl font-bold">Recent sessions</h2>
                    <ul className="mt-3 grid gap-2">
                      {ov.recentSessions.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between rounded-[var(--radius)] px-4 py-3 text-sm"
                          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                        >
                          <span>
                            {SESSION_KIND_LABELS[s.kind] ?? "Scenario practice"}
                            <span style={{ color: "var(--dim)" }}>
                              {" "}
                              · {new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                          </span>
                          <span className="font-semibold">
                            {s.correctCount}/{s.answeredCount} correct
                            {s.completed ? "" : " · unfinished"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                <div className="mt-8">
                  {confirmReset ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm">Erase all saved progress?</p>
                      <button
                        type="button"
                        onClick={() => resetMutation.mutate()}
                        className="rounded-full px-4 py-2 text-sm font-semibold"
                        style={{ background: "var(--bad)", color: "#fff" }}
                      >
                        Yes, erase it
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmReset(false)}
                        className="rounded-full px-4 py-2 text-sm font-semibold"
                        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                      >
                        Keep my progress
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmReset(true)}
                      className="text-sm underline"
                      style={{ color: "var(--dim)" }}
                    >
                      Reset saved progress
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="mt-6 text-sm" style={{ color: "var(--bad)" }}>
                Your progress could not load. Please reopen the page.
              </p>
            )}
          </section>
        )}

        {view === "chart" && (
          <section className="pt-5">
            <h1 className="font-display text-3xl font-bold">The process chart</h1>
            <p className="mt-2 text-base" style={{ color: "var(--dim)" }}>
              Processes in process group order. Learn the flow left to right: a project is
              authorized, planned, executed while it is monitored and controlled, then closed.
              Most process questions are really asking where a piece of work sits in this flow.
            </p>
            <div className="mt-5 grid gap-3">
              {CHART_REFERENCE.map((row, i) => (
                <div
                  key={row.group}
                  className="rounded-[var(--radius)] p-4"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <p className="font-display text-lg font-bold">
                    <span style={{ color: "var(--accent)" }}>{i + 1}. </span>
                    {row.group}
                  </p>
                  <ul className="mt-2 grid gap-1 text-sm" style={{ color: "var(--dim)" }}>
                    {row.processes.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={startMutation.isPending}
              onClick={() => startMutation.mutate({ kind: "chart", size: 10 })}
              className="font-display mt-5 flex w-full items-center justify-center gap-3 rounded-[var(--radius)] px-6 py-4 text-lg font-bold"
              style={{ background: "var(--accent-strong)", color: "#ffffff" }}
            >
              Drill the chart out loud
            </button>
          </section>
        )}

        {view === "gap" && (
          <section className="pt-5">
            <h1 className="font-display text-3xl font-bold">Gap analysis</h1>
            <p className="mt-2 text-base" style={{ color: "var(--dim)" }}>
              A gap analysis names exactly what to restudy instead of rereading everything.
              Topics below 70% correct, after at least two answers, go on your restudy list,
              weakest first.
            </p>
            {overview.isPending || !ov ? (
              <p className="mt-6 text-sm" style={{ color: "var(--dim)" }}>Loading your analysis...</p>
            ) : ov.totalAttempts === 0 ? (
              <div
                className="mt-6 rounded-[var(--radius)] p-5"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <p className="text-base">
                  No answers yet, so there are no gaps to name. Finish a practice set and this
                  page will point at the specific processes and topics that need work.
                </p>
                <button
                  type="button"
                  onClick={() => setView("home")}
                  className="font-display mt-4 rounded-full px-5 py-2.5 font-semibold"
                  style={{ background: "var(--accent-strong)", color: "#ffffff" }}
                >
                  Go to practice
                </button>
              </div>
            ) : (
              <>
                {weakestName ? (
                  <div
                    className="mt-5 rounded-[var(--radius)] p-5"
                    style={{ background: "var(--surface)", border: "2px solid var(--bad)" }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--bad)" }}>
                      Start restudy here
                    </p>
                    <p className="font-display mt-1 text-2xl font-bold">
                      {weakestName} is your weakest domain
                    </p>
                    <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
                      Weighted score so far: {ov.weightedScore}% across {ov.coveredWeight}% of
                      the exam weight you have practiced.
                    </p>
                  </div>
                ) : null}

                <h2 className="font-display mt-6 text-xl font-bold">Restudy list: specific topics</h2>
                {ov.topics.some((t) => t.needsRestudy) ? (
                  <ul className="mt-3 grid gap-2">
                    {ov.topics
                      .filter((t) => t.needsRestudy)
                      .map((t) => (
                        <li
                          key={t.topic}
                          className="rounded-[var(--radius)] px-4 py-3"
                          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="font-semibold">{t.topic}</p>
                            <p className="text-sm font-semibold" style={{ color: "var(--bad)" }}>
                              {t.accuracy}%
                            </p>
                          </div>
                          <p className="text-sm" style={{ color: "var(--dim)" }}>
                            {ov.domains.find((d) => d.key === t.domain)?.name} domain · {t.correct}{" "}
                            of {t.attempted} correct. Restudy this process before your next set.
                          </p>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm" style={{ color: "var(--dim)" }}>
                    Nothing qualifies yet. A topic joins the restudy list once you have answered
                    it at least twice and scored under 70%. Keep practicing and the list will get
                    specific.
                  </p>
                )}

                <h2 className="font-display mt-7 text-xl font-bold">All topics attempted</h2>
                <ul className="mt-3 grid gap-2">
                  {ov.topics.map((t) => (
                    <li
                      key={t.topic}
                      className="flex items-center justify-between rounded-[var(--radius)] px-4 py-3 text-sm"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      <span>
                        {t.topic}
                        <span style={{ color: "var(--dim)" }}>
                          {" "}
                          · {ov.domains.find((d) => d.key === t.domain)?.name}
                        </span>
                      </span>
                      <span className="font-semibold">
                        {t.accuracy}% ({t.correct}/{t.attempted})
                      </span>
                    </li>
                  ))}
                </ul>

                <h2 className="font-display mt-7 text-xl font-bold">Accuracy by process group</h2>
                <ul className="mt-3 grid gap-2">
                  {ov.processGroups.map((g) => (
                    <li
                      key={g.group}
                      className="rounded-[var(--radius)] px-4 py-3"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-semibold">{g.group}</p>
                        <p className="text-sm" style={{ color: "var(--dim)" }}>
                          {g.attempted === 0 ? "No answers yet" : `${g.accuracy}% from ${g.attempted}`}
                        </p>
                      </div>
                      <div
                        className="mt-2 h-2.5 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--surface2)" }}
                      >
                        <div
                          style={{
                            width: `${g.accuracy ?? 0}%`,
                            height: "100%",
                            background: "var(--process)",
                            borderRadius: 999,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>

                <h2 className="font-display mt-7 text-xl font-bold">Domains at exam weights</h2>
                <div className="mt-3 grid gap-3">
                  {ov.domains.map((d) => (
                    <DomainBar
                      key={d.key}
                      name={d.name}
                      weight={d.weight}
                      accuracy={d.accuracy}
                      attempted={d.attempted}
                      isWeakest={ov.weakestDomain === d.key}
                      color={DOMAIN_COLORS[d.key] ?? "var(--accent)"}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {view === "audit" && (
          <section className="pt-5">
            <h1 className="font-display text-3xl font-bold">Bank audit</h1>
            <p className="mt-2 text-base" style={{ color: "var(--dim)" }}>
              Counted from the question bank itself, not from your answers: how many
              questions sit in each domain, how that share compares with the July 2026
              blueprint targets, and how the Week 4, Week 5, and expansion packs changed
              the mix.
            </p>
            {bankAudit.isPending ? (
              <p className="mt-6 text-sm" style={{ color: "var(--dim)" }}>Counting the bank...</p>
            ) : !bankAudit.data ? (
              <p className="mt-6 text-sm" style={{ color: "var(--bad)" }}>
                The audit could not load. Please reopen the page.
              </p>
            ) : (
              <>
                <div
                  className="mt-5 rounded-[var(--radius)] p-5"
                  style={{ background: "var(--surface)", border: "2px solid var(--bad)" }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--bad)" }}>
                    The gap Week 4 works to close
                  </p>
                  <p className="font-display mt-1 text-2xl font-bold">
                    People was short by about {Math.round(bankAudit.data.peopleShortfallPrePack)} questions
                  </p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
                    Before the Week 4 pack, the bank held {bankAudit.data.prePackTotal}{" "}
                    questions. At that size, the 33 percent People target needs about{" "}
                    {Math.round((bankAudit.data.prePackTotal * 33) / 100)} People questions,
                    and the bank had{" "}
                    {bankAudit.data.domains.find((d) => d.key === "people")?.prePackCount ?? 0}.
                    The Week 4 pack adds {bankAudit.data.weekFourSize} questions: 14 People
                    and 6 Business Environment, including the new AI in project delivery and
                    sustainability topics. The Week 5 and expansion packs below keep closing
                    the same gap, because the target grows as the bank grows; the current
                    snapshot at the bottom of this page shows where the bank stands now.
                  </p>
                </div>

                <h2 className="font-display mt-6 text-xl font-bold">
                  Before Week 4: {bankAudit.data.prePackTotal} questions
                </h2>
                <div className="mt-3 grid gap-3">
                  {bankAudit.data.domains.map((d) => (
                    <div
                      key={`pre-${d.key}`}
                      className="rounded-[var(--radius)] p-4"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-display text-base font-semibold">{d.name}</p>
                        <p className="text-sm" style={{ color: "var(--dim)" }}>
                          Blueprint target {d.targetWeight}%
                        </p>
                      </div>
                      <div
                        className="mt-3 h-3 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--surface2)" }}
                        role="img"
                        aria-label={`${d.name} held ${d.prePackCount} of ${bankAudit.data.prePackTotal} questions, ${d.prePackShare} percent, against a ${d.targetWeight} percent target`}
                      >
                        <div
                          style={{
                            width: `${d.prePackShare}%`,
                            height: "100%",
                            background: DOMAIN_COLORS[d.key] ?? "var(--accent)",
                            borderRadius: 999,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-sm" style={{ color: "var(--dim)" }}>
                        {d.prePackCount} of {bankAudit.data.prePackTotal} questions ·{" "}
                        {d.prePackShare}% of the bank · target {d.targetWeight}%
                      </p>
                    </div>
                  ))}
                </div>

                <h2 className="font-display mt-7 text-xl font-bold">
                  With Week 4: {bankAudit.data.afterWeekFourTotal} questions
                </h2>
                <div className="mt-3 grid gap-3">
                  {bankAudit.data.domains.map((d) => (
                    <div
                      key={`w4-${d.key}`}
                      className="rounded-[var(--radius)] p-4"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-display text-base font-semibold">{d.name}</p>
                        <p className="text-sm" style={{ color: "var(--dim)" }}>
                          Blueprint target {d.targetWeight}%
                        </p>
                      </div>
                      <div
                        className="mt-3 h-3 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--surface2)" }}
                        role="img"
                        aria-label={`${d.name} held ${d.afterWeekFourCount} of ${bankAudit.data.afterWeekFourTotal} questions after the Week 4 pack, ${d.afterWeekFourShare} percent, against a ${d.targetWeight} percent target`}
                      >
                        <div
                          style={{
                            width: `${d.afterWeekFourShare}%`,
                            height: "100%",
                            background: DOMAIN_COLORS[d.key] ?? "var(--accent)",
                            borderRadius: 999,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-sm" style={{ color: "var(--dim)" }}>
                        {d.afterWeekFourCount} of {bankAudit.data.afterWeekFourTotal}{" "}
                        questions · {d.afterWeekFourShare}% of the bank · target{" "}
                        {d.targetWeight}%
                      </p>
                    </div>
                  ))}
                </div>

                <div
                  className="mt-7 rounded-[var(--radius)] p-5"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--dim)" }}>
                    Week 5: aimed at the weak areas
                  </p>
                  <p className="font-display mt-1 text-2xl font-bold">
                    {bankAudit.data.weekFiveSize} new questions driven by your gap analysis
                  </p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
                    Process was the weakest domain and Monitoring and Controlling the
                    weakest process group, so the Week 5 pack adds 9 Process questions,
                    6 People questions, and 5 Business Environment questions. They target
                    the restudy list directly: Collect Requirements and Define Scope,
                    Direct and Manage Project Work, Monitor and Control Project Work,
                    Validate Scope, Identify Stakeholders, Develop Team and Manage Team,
                    plus Communications Management and Perform Integrated Change Control.
                    Stakeholder and procurement angles are folded into those questions
                    rather than split into a separate pack.
                  </p>
                </div>

                <h2 className="font-display mt-7 text-xl font-bold">
                  With Week 5: {bankAudit.data.afterWeekFiveTotal} questions
                </h2>
                <div className="mt-3 grid gap-3">
                  {bankAudit.data.domains.map((d) => (
                    <div
                      key={`w5-${d.key}`}
                      className="rounded-[var(--radius)] p-4"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-display text-base font-semibold">{d.name}</p>
                        <p className="text-sm" style={{ color: "var(--dim)" }}>
                          Blueprint target {d.targetWeight}%
                        </p>
                      </div>
                      <div
                        className="mt-3 h-3 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--surface2)" }}
                        role="img"
                        aria-label={`${d.name} held ${d.afterWeekFiveCount} of ${bankAudit.data.afterWeekFiveTotal} questions after the Week 5 pack, ${d.afterWeekFiveShare} percent, against a ${d.targetWeight} percent target`}
                      >
                        <div
                          style={{
                            width: `${d.afterWeekFiveShare}%`,
                            height: "100%",
                            background: DOMAIN_COLORS[d.key] ?? "var(--accent)",
                            borderRadius: 999,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-sm" style={{ color: "var(--dim)" }}>
                        {d.afterWeekFiveCount} of {bankAudit.data.afterWeekFiveTotal}{" "}
                        questions · {d.afterWeekFiveShare}% of the bank · target{" "}
                        {d.targetWeight}%
                      </p>
                    </div>
                  ))}
                </div>

                <div
                  className="mt-7 rounded-[var(--radius)] p-5"
                  style={{ background: "var(--surface)", border: "2px solid var(--accent-strong)" }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--dim)" }}>
                    The expansion pack: past 250 questions
                  </p>
                  <p className="font-display mt-1 text-2xl font-bold">
                    {bankAudit.data.weekSixSize} new questions take the bank to{" "}
                    {bankAudit.data.totalQuestions}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--dim)" }}>
                    The expansion pack adds 40 People, 42 Process, and 18 Business
                    Environment questions. That mix was chosen to close the People gap the
                    Week 4 callout above names: at {bankAudit.data.totalQuestions}{" "}
                    questions the bank now sits within about a point of every blueprint
                    target, People {bankAudit.data.domains.find((d) => d.key === "people")?.share ?? 0}%
                    against 33%, Process{" "}
                    {bankAudit.data.domains.find((d) => d.key === "process")?.share ?? 0}%
                    against 41%, and Business Environment{" "}
                    {bankAudit.data.domains.find((d) => d.key === "business")?.share ?? 0}%
                    against 26%. The bank is now larger than the real 180 question exam,
                    so the mock exam offers a true full length 180, or the whole bank.
                  </p>
                </div>

                <h2 className="font-display mt-7 text-xl font-bold">
                  With the expansion pack: {bankAudit.data.totalQuestions} questions
                </h2>
                <div className="mt-3 grid gap-3">
                  {bankAudit.data.domains.map((d) => (
                    <div
                      key={`now-${d.key}`}
                      className="rounded-[var(--radius)] p-4"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-display text-base font-semibold">{d.name}</p>
                        <p className="text-sm" style={{ color: "var(--dim)" }}>
                          Blueprint target {d.targetWeight}%
                        </p>
                      </div>
                      <div
                        className="mt-3 h-3 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--surface2)" }}
                        role="img"
                        aria-label={`${d.name} now holds ${d.count} of ${bankAudit.data.totalQuestions} questions, ${d.share} percent, against a ${d.targetWeight} percent target`}
                      >
                        <div
                          style={{
                            width: `${d.share}%`,
                            height: "100%",
                            background: DOMAIN_COLORS[d.key] ?? "var(--accent)",
                            borderRadius: 999,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-sm" style={{ color: "var(--dim)" }}>
                        {d.count} of {bankAudit.data.totalQuestions} questions · {d.share}%
                        of the bank · target {d.targetWeight}%
                        {d.shortfall > 0
                          ? ` · about ${Math.round(d.shortfall)} questions short of target`
                          : " · at or above target"}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm" style={{ color: "var(--dim)" }}>
                  Counts include scenario, formula drill, and process chart questions.
                  Practice sets and mock exams still draw at the July 2026 weights, so your
                  study mix follows the blueprint even while the bank composition catches up.
                </p>
              </>
            )}
          </section>
        )}

        {view === "glossary" && (
          <section className="pt-5">
            <h1 className="font-display text-3xl font-bold">Glossary</h1>
            <p className="mt-2 text-base" style={{ color: "var(--dim)" }}>
              The core PMP vocabulary in plain language, written for this app. Terms are
              grouped the way the material is organized for study: by exam domain and by
              process group. Pairs the exam loves to swap are flagged as easily confused,
              and every term has a recording that reads it aloud.
            </p>

            <div className="mt-5">
              <label htmlFor="glossary-search" className="text-sm font-semibold" style={{ color: "var(--dim)" }}>
                Search the glossary
              </label>
              <input
                id="glossary-search"
                type="search"
                value={glossarySearch}
                onChange={(e) => setGlossarySearch(e.target.value)}
                placeholder="Try: change control, float, scope"
                className="mt-2 w-full rounded-[var(--radius)] px-4 py-3 text-base"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Group glossary by">
              {(
                [
                  ["domain", "By domain"],
                  ["group", "By process group"],
                  ["pairs", "Confused pairs"],
                ] as ["domain" | "group" | "pairs", string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGlossaryGroupMode(mode)}
                  aria-pressed={glossaryGroupMode === mode}
                  className="rounded-full px-4 py-2 text-sm font-semibold"
                  style={{
                    background: glossaryGroupMode === mode ? "var(--text)" : "var(--surface)",
                    color: glossaryGroupMode === mode ? "var(--bg)" : "var(--text)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {glossary.isPending ? (
              <p className="mt-6 text-sm" style={{ color: "var(--dim)" }}>Loading the glossary...</p>
            ) : !glossary.data ? (
              <p className="mt-6 text-sm" style={{ color: "var(--bad)" }}>
                The glossary could not load. Please reopen the page.
              </p>
            ) : glossaryGroupMode === "pairs" ? (
              <>
                <p className="mt-4 text-sm" style={{ color: "var(--dim)" }}>
                  {confusedPairs.length} pairs the exam tries to swap. Learn what separates
                  each pair and the swap stops working on you.
                </p>
                {confusedPairs.length === 0 ? (
                  <p className="mt-4 text-sm" style={{ color: "var(--dim)" }}>
                    No confused pairs match that search.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {confusedPairs.map(([a, b]) => (
                      <div
                        key={`${a.id}|${b.id}`}
                        className="rounded-[var(--radius)] p-4"
                        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                      >
                        <p className="font-display text-lg font-bold">
                          {a.term} <span style={{ color: "var(--bad)" }}>vs</span> {b.term}
                        </p>
                        {[a, b].map((t) => (
                          <div key={t.id} className="mt-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-display text-base font-bold">{t.term}</p>
                              <TermBadges term={t} />
                            </div>
                            <div className="mt-2">
                              <TermBody
                                term={t}
                                playing={playingKey === `g-${t.id}`}
                                onToggleAudio={toggleTermAudio}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="mt-4 text-sm" style={{ color: "var(--dim)" }}>
                  Showing {filteredTerms.length} of {glossaryTerms.length} terms. Tap a term
                  to read it, or press listen to hear it.
                </p>
                {filteredTerms.length === 0 ? (
                  <p className="mt-4 text-sm" style={{ color: "var(--dim)" }}>
                    No terms match that search. Try a shorter word, like change, risk, or scope.
                  </p>
                ) : (
                  (glossaryGroupMode === "domain"
                    ? [
                        { key: "people", name: "People", note: "Exam weight 33%" },
                        { key: "process", name: "Process", note: "Exam weight 41%" },
                        { key: "business", name: "Business Environment", note: "Exam weight 26%" },
                      ].map((g) => ({
                        ...g,
                        terms: filteredTerms.filter((t) => t.domain === g.key),
                      }))
                    : [
                        ...PROCESS_GROUP_ORDER.map((name, i) => ({
                          key: name,
                          name,
                          note: `Stage ${i + 1} of 5`,
                          terms: filteredTerms.filter((t) => t.processGroup === name),
                        })),
                        {
                          key: "across",
                          name: "Across all groups",
                          note: "Used in every stage",
                          terms: filteredTerms.filter((t) => t.processGroup === null),
                        },
                      ]
                  )
                    .filter((g) => g.terms.length > 0)
                    .map((g) => (
                      <div key={g.key} className="mt-6">
                        <h2 className="font-display text-xl font-bold">
                          {g.name}{" "}
                          <span className="text-sm font-semibold" style={{ color: "var(--dim)" }}>
                            {g.note} · {g.terms.length} term{g.terms.length === 1 ? "" : "s"}
                          </span>
                        </h2>
                        <div className="mt-3 grid gap-2">
                          {g.terms.map((t) => (
                            <div
                              key={t.id}
                              className="rounded-[var(--radius)]"
                              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleOpenTerm(t.id)}
                                aria-expanded={openTermId === t.id}
                                className="w-full px-4 py-3 text-left"
                              >
                                <span className="flex items-start justify-between gap-2">
                                  <span className="font-display text-base font-bold">{t.term}</span>
                                  <span aria-hidden="true" className="text-lg font-bold" style={{ color: "var(--dim)" }}>
                                    {openTermId === t.id ? "−" : "+"}
                                  </span>
                                </span>
                                <span className="mt-1.5 block">
                                  <TermBadges term={t} />
                                </span>
                              </button>
                              {openTermId === t.id ? (
                                <div className="px-4 pb-4">
                                  <TermBody
                                    term={t}
                                    playing={playingKey === `g-${t.id}`}
                                    onToggleAudio={toggleTermAudio}
                                  />
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                )}
              </>
            )}
          </section>
        )}

        {view === "practice" && session && current && (
          <section className="pt-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={leaveSession}
                className="rounded-full px-4 py-2 text-sm font-semibold"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                {isMock ? "Abandon exam" : "End session"}
              </button>
              {isMock ? (
                <p
                  className="font-display rounded-full px-4 py-2 text-base font-bold"
                  style={{
                    background: timeLeft <= 300 ? "var(--bad)" : "var(--surface)",
                    color: timeLeft <= 300 ? "#fff" : "var(--text)",
                    border: "1px solid var(--border)",
                  }}
                  role="timer"
                  aria-label={`Time remaining ${formatClock(timeLeft)}`}
                >
                  {formatClock(timeLeft)}
                </p>
              ) : (
                <p className="text-sm font-semibold" style={{ color: "var(--dim)" }}>
                  Question {qIndex + 1} of {session.questions.length} · {sessionCorrect} correct
                </p>
              )}
            </div>
            {isMock ? (
              <p className="mt-2 text-sm font-semibold" style={{ color: "var(--dim)" }}>
                Question {qIndex + 1} of {session.questions.length} ·{" "}
                {Object.keys(mockAnswers).length} answered · {mockFlags.size} flagged · No
                feedback until you finish
              </p>
            ) : null}
            <div
              className="mt-3 h-2 w-full overflow-hidden rounded-full"
              style={{ background: "var(--surface2)" }}
              role="img"
              aria-label={`Progress: question ${qIndex + 1} of ${session.questions.length}`}
            >
              <div
                style={{
                  width: `${
                    isMock
                      ? (Object.keys(mockAnswers).length / session.questions.length) * 100
                      : ((qIndex + (result ? 1 : 0)) / session.questions.length) * 100
                  }%`,
                  height: "100%",
                  background: "var(--accent-strong)",
                  borderRadius: 999,
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            {isMock ? (
              <div
                className="mt-4 rounded-[var(--radius)] p-4"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold" style={{ color: "var(--dim)" }}>
                    Question navigator
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleMockFlag(current.id)}
                    aria-pressed={mockFlags.has(current.id)}
                    className="rounded-full px-4 py-2 text-sm font-semibold"
                    style={{
                      background: mockFlags.has(current.id) ? "var(--accent-strong)" : "var(--surface2)",
                      color: mockFlags.has(current.id) ? "#ffffff" : "var(--text)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {mockFlags.has(current.id) ? "Flagged for review" : "Flag for review"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {session.questions.map((q, i) => {
                    const answered = mockAnswers[q.id] !== undefined;
                    const flagged = mockFlags.has(q.id);
                    const isCurrent = i === qIndex;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => jumpToQuestion(i)}
                        aria-label={`Go to question ${i + 1}${answered ? ", answered" : ", not answered"}${flagged ? ", flagged" : ""}`}
                        aria-current={isCurrent ? "true" : undefined}
                        className="font-display flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
                        style={{
                          background: isCurrent
                            ? "var(--accent-strong)"
                            : answered
                              ? "var(--text)"
                              : "var(--surface2)",
                          color: isCurrent ? "#ffffff" : answered ? "var(--bg)" : "var(--text)",
                          border: flagged
                            ? "2px solid var(--bad)"
                            : "1px solid var(--border)",
                        }}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--dim)" }}>
                  Dark means answered. A red ring means flagged. Tap any number to jump to
                  that question and change its answer.
                </p>
              </div>
            ) : null}

            <div
              className="mt-4 rounded-[var(--radius)] p-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full px-3 py-1 text-xs font-bold"
                  style={{
                    background: DOMAIN_COLORS[current.domain] ?? "var(--accent)",
                    color: "var(--on-domain)",
                  }}
                >
                  {session.kind === "chart"
                    ? `Process chart · ${current.processGroup ?? ""}`
                    : session.kind === "formula"
                      ? `Formula drill · ${current.processGroup ?? ""}`
                      : (ov?.domains.find((d) => d.key === current.domain)?.name ?? current.domain)}
                </span>
                {session.kind !== "chart" ? (
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ background: "var(--surface2)", color: "var(--dim)" }}
                  >
                    {FORMAT_LABELS[current.format] ?? "Situational"}
                  </span>
                ) : null}
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: "var(--surface2)", color: "var(--dim)" }}
                >
                  {current.topic}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <PlayButton
                  playing={playingKey === `q-${current.id}`}
                  onToggle={() => playAudio(questionAudio[current.id], `q-${current.id}`)}
                  label={playingKey === `q-${current.id}` ? "Pause the question" : "Play the question aloud"}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-display text-base font-semibold">
                    <LevelBars active={playingKey === `q-${current.id}`} />
                    {playingKey === `q-${current.id}` ? "Listening..." : "Tap play to hear the scenario"}
                  </p>
                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                    style={{ background: "var(--surface2)" }}
                    aria-hidden="true"
                  >
                    <div
                      style={{
                        width: `${playingKey === `q-${current.id}` ? progress * 100 : 0}%`,
                        height: "100%",
                        background: "var(--accent-strong)",
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => playAudio(questionAudio[current.id], `q-${current.id}`)}
                    className="mt-2 text-sm font-semibold underline"
                    style={{ color: "var(--accent)" }}
                  >
                    {playingKey === `q-${current.id}` ? "Pause" : "Replay question"}
                  </button>
                </div>
              </div>

              <p className="mt-4 text-base leading-relaxed">{current.scenario}</p>
              <p className="mt-3 font-display text-lg font-bold leading-snug">{current.stem}</p>
              <TermLookup
                label="Terms in this question: tap to look one up"
                termIds={current.glossaryTermIds}
                termsById={termsById}
                openTermId={openTermId}
                onToggleTerm={toggleOpenTerm}
                playingKey={playingKey}
                onToggleAudio={toggleTermAudio}
              />
            </div>

            {!result && (
              <>
                <div className="mt-4 grid gap-3">
                  {current.options.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={submitMutation.isPending}
                      onClick={() => submitChoice(i, "tap")}
                      aria-label={`Answer ${LETTERS[i]}: ${opt}`}
                      className="flex items-start gap-3 rounded-[var(--radius)] p-4 text-left"
                      style={{
                        background:
                          voicePending?.index === i ||
                          (isMock && mockAnswers[current.id]?.index === i)
                            ? "var(--surface2)"
                            : "var(--surface)",
                        border:
                          voicePending?.index === i ||
                          (isMock && mockAnswers[current.id]?.index === i)
                            ? "2px solid var(--accent-strong)"
                            : "1px solid var(--border)",
                      }}
                    >
                      <span
                        className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                        style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}
                      >
                        {LETTERS[i]}
                      </span>
                      <span className="text-base leading-snug">{opt}</span>
                    </button>
                  ))}
                </div>

                {voicePending ? (
                  <div
                    className="mt-4 rounded-[var(--radius)] p-4"
                    style={{ background: "var(--surface)", border: "2px solid var(--accent-strong)" }}
                  >
                    <p className="text-base">
                      Heard: <span className="font-semibold">"{voicePending.transcript}"</span>
                    </p>
                    <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
                      Matched to option {LETTERS[voicePending.index]}.{" "}
                      {isMock ? "Select it, or pick a different answer above." : "Score it, or pick a different answer above."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => submitChoice(voicePending.index, "voice")}
                        className="font-display rounded-full px-5 py-2.5 font-semibold"
                        style={{ background: "var(--accent-strong)", color: "#ffffff" }}
                      >
                        {isMock ? "Select" : "Score"} option {LETTERS[voicePending.index]}
                      </button>
                      <button
                        type="button"
                        onClick={() => setVoicePending(null)}
                        className="font-display rounded-full px-5 py-2.5 font-semibold"
                        style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}
                      >
                        Choose again
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startListening}
                    disabled={listening}
                    aria-label="Answer by voice"
                    className="font-display mt-4 flex w-full items-center justify-center gap-3 rounded-[var(--radius)] px-6 py-4 text-lg font-bold"
                    style={{
                      background: listening ? "var(--bad)" : "var(--surface)",
                      color: listening ? "#fff" : "var(--text)",
                      border: "2px solid var(--accent-strong)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        background: listening ? "#fff" : "var(--bad)",
                      }}
                    />
                    {listening ? "Listening... say your answer" : "Answer by voice"}
                  </button>
                )}
                {voiceNote ? (
                  <p className="mt-3 text-sm" style={{ color: "var(--dim)" }} role="status">
                    {voiceNote}
                  </p>
                ) : null}
                {submitMutation.isPending ? (
                  <p className="mt-3 text-sm" style={{ color: "var(--dim)" }}>Checking your answer...</p>
                ) : null}

                {isMock ? (
                  <div className="mt-5">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={qIndex === 0 || mockSubmitting}
                        onClick={() => jumpToQuestion(qIndex - 1)}
                        className="font-display flex-1 rounded-full px-5 py-3 font-semibold"
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          opacity: qIndex === 0 ? 0.5 : 1,
                        }}
                      >
                        Previous question
                      </button>
                      <button
                        type="button"
                        disabled={qIndex + 1 >= session.questions.length || mockSubmitting}
                        onClick={() => jumpToQuestion(qIndex + 1)}
                        className="font-display flex-1 rounded-full px-5 py-3 font-semibold"
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          opacity: qIndex + 1 >= session.questions.length ? 0.5 : 1,
                        }}
                      >
                        Next question
                      </button>
                    </div>
                    {confirmFinishMock ? (
                      <div
                        className="mt-4 rounded-[var(--radius)] p-4"
                        style={{ background: "var(--surface)", border: "2px solid var(--accent-strong)" }}
                      >
                        <p className="text-base">
                          Finish the exam now? You answered{" "}
                          {Object.keys(mockAnswers).length} of {session.questions.length}{" "}
                          questions
                          {mockFlags.size > 0
                            ? `, and ${mockFlags.size} ${mockFlags.size === 1 ? "is" : "are"} still flagged`
                            : ""}
                          . Unanswered questions count as not correct, and explanations
                          unlock on the results page.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={mockSubmitting}
                            onClick={() => void finishMock()}
                            className="font-display rounded-full px-5 py-3 font-bold"
                            style={{ background: "var(--accent-strong)", color: "#ffffff" }}
                          >
                            {mockSubmitting ? "Submitting..." : "Yes, finish and score my exam"}
                          </button>
                          <button
                            type="button"
                            disabled={mockSubmitting}
                            onClick={() => setConfirmFinishMock(false)}
                            className="font-display rounded-full px-5 py-3 font-semibold"
                            style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}
                          >
                            Keep going
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={mockSubmitting}
                        onClick={() => setConfirmFinishMock(true)}
                        className="font-display mt-4 w-full rounded-[var(--radius)] px-6 py-4 text-lg font-bold"
                        style={{ background: "var(--accent-strong)", color: "#ffffff" }}
                      >
                        Finish exam and see my score
                      </button>
                    )}
                    {mockSubmitNote ? (
                      <p className="mt-3 text-sm" style={{ color: "var(--dim)" }} role="status">
                        {mockSubmitNote}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}

            {result && (
              <div
                className="mt-4 rounded-[var(--radius)] p-5"
                style={{
                  background: "var(--surface)",
                  border: `2px solid ${result.correct ? "var(--good)" : "var(--bad)"}`,
                }}
                role="status"
              >
                <p
                  className="font-display text-2xl font-bold"
                  style={{ color: result.correct ? "var(--good)" : "var(--bad)" }}
                >
                  {result.correct ? "Correct." : "Not quite."}
                </p>
                <p className="mt-1 text-base">
                  The best answer is{" "}
                  <strong>
                    {LETTERS[result.correctIndex]}: {current.options[result.correctIndex]}
                  </strong>
                  {chosen !== null && !result.correct
                    ? `. You chose ${LETTERS[chosen]}.`
                    : "."}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <PlayButton
                    size={52}
                    playing={playingKey === `e-${current.id}`}
                    onToggle={() => playAudio(explanationAudio[current.id], `e-${current.id}`)}
                    label={
                      playingKey === `e-${current.id}`
                        ? "Pause the explanation"
                        : "Play the explanation aloud"
                    }
                  />
                  <p className="text-sm font-semibold" style={{ color: "var(--dim)" }}>
                    {playingKey === `e-${current.id}`
                      ? "Playing the explanation..."
                      : "Hear the explanation"}
                  </p>
                </div>
                <p className="mt-3 text-base leading-relaxed">{result.explanation}</p>
                <div
                  className="mt-3 rounded-[var(--radius)] p-3"
                  style={{ background: "var(--surface2)" }}
                >
                  <p className="text-sm">
                    <span className="font-display font-bold" style={{ color: "var(--accent)" }}>
                      Exam trap:{" "}
                    </span>
                    {result.trap}
                  </p>
                </div>
                <TermLookup
                  label="Terms in this explanation: tap to look one up"
                  termIds={result.glossaryTermIds}
                  termsById={termsById}
                  openTermId={openTermId}
                  onToggleTerm={toggleOpenTerm}
                  playingKey={playingKey}
                  onToggleAudio={toggleTermAudio}
                />
                <button
                  type="button"
                  onClick={goNext}
                  disabled={finishMutation.isPending}
                  className="font-display mt-4 w-full rounded-[var(--radius)] px-6 py-4 text-lg font-bold"
                  style={{ background: "var(--accent-strong)", color: "#ffffff" }}
                >
                  {qIndex + 1 >= session.questions.length
                    ? finishMutation.isPending
                      ? "Scoring your set..."
                      : "See my results"
                    : "Next question"}
                </button>
              </div>
            )}
          </section>
        )}

        {view === "results" && summary && summary.kind === "mock" && (
          <section className="pt-6">
            <h1 className="font-display text-3xl font-bold">Mock exam complete</h1>
            <p className="mt-2 text-base" style={{ color: "var(--dim)" }}>
              {summary.correct} of {summary.totalQuestions} correct · {summary.answered}{" "}
              answered · {Math.max(0, summary.totalQuestions - summary.answered)} unanswered,
              counted as not correct.
            </p>
            <div
              className="mt-5 rounded-[var(--radius)] p-5 text-center"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <p className="text-sm" style={{ color: "var(--dim)" }}>
                Exam score
              </p>
              <p className="font-display text-6xl font-bold">
                {summary.totalQuestions > 0
                  ? `${Math.round((summary.correct / summary.totalQuestions) * 100)}%`
                  : "0%"}
              </p>
              {summary.weightedScore !== null ? (
                <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
                  Domain weighted score: {summary.weightedScore}% at the July 2026 weights
                  (People 33%, Process 41%, Business Environment 26%), across the domains you
                  answered.
                </p>
              ) : null}
              {summary.weakestTopic ? (
                <p className="mt-2 text-base">
                  Weakest topic this exam: <strong>{summary.weakestTopic}</strong>. It is on
                  your gap analysis page.
                </p>
              ) : null}
            </div>

            <h2 className="font-display mt-6 text-xl font-bold">Score by domain</h2>
            <div className="mt-3 grid gap-3">
              {summary.domains
                .filter((d) => d.attempted > 0)
                .map((d) => (
                  <DomainBar
                    key={d.key}
                    name={d.name}
                    weight={d.weight}
                    accuracy={d.accuracy}
                    attempted={d.attempted}
                    isWeakest={false}
                    color={DOMAIN_COLORS[d.key] ?? "var(--accent)"}
                  />
                ))}
            </div>

            <h2 className="font-display mt-7 text-xl font-bold">Score by process group</h2>
            <ul className="mt-3 grid gap-2">
              {summary.processGroups.map((g) => (
                <li
                  key={g.group}
                  className="rounded-[var(--radius)] px-4 py-3"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold">{g.group}</p>
                    <p className="text-sm" style={{ color: "var(--dim)" }}>
                      {g.attempted === 0 ? "No questions" : `${g.accuracy}% from ${g.attempted}`}
                    </p>
                  </div>
                  <div
                    className="mt-2 h-2.5 w-full overflow-hidden rounded-full"
                    style={{ background: "var(--surface2)" }}
                  >
                    <div
                      style={{
                        width: `${g.accuracy ?? 0}%`,
                        height: "100%",
                        background: "var(--process)",
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setView("gap")}
                className="font-display rounded-full px-5 py-3 font-semibold"
                style={{ background: "var(--accent-strong)", color: "#ffffff" }}
              >
                View gap analysis
              </button>
              <button
                type="button"
                onClick={() => {
                  setSession(null);
                  setView("home");
                }}
                className="font-display rounded-full px-5 py-3 font-semibold"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                Back to practice
              </button>
            </div>

            <h2 className="font-display mt-8 text-xl font-bold">
              Review: every question, with explanations
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
              This is the first time explanations appear for this exam, by design. Work
              through the misses and the trap notes before your next attempt.
            </p>
            <div className="mt-4 grid gap-3">
              {summary.review.map((r, i) => (
                <div
                  key={r.questionId}
                  className="rounded-[var(--radius)] p-4"
                  style={{
                    background: "var(--surface)",
                    border: `2px solid ${r.correct ? "var(--good)" : "var(--bad)"}`,
                  }}
                >
                  <p className="text-sm font-semibold" style={{ color: "var(--dim)" }}>
                    Question {i + 1} · {DOMAIN_NAMES[r.domain] ?? r.domain} · {r.topic}
                    {r.processGroup ? ` · ${r.processGroup}` : ""}
                  </p>
                  <p className="mt-2 text-base leading-relaxed">{r.scenario}</p>
                  <p className="mt-2 font-display text-base font-bold leading-snug">{r.stem}</p>
                  <p
                    className="font-display mt-3 text-lg font-bold"
                    style={{ color: r.correct ? "var(--good)" : "var(--bad)" }}
                  >
                    {r.correct ? "Correct." : "Not correct."}
                  </p>
                  <p className="mt-1 text-base">
                    Your answer:{" "}
                    <strong>
                      {LETTERS[r.chosenIndex]}: {r.options[r.chosenIndex]}
                    </strong>
                  </p>
                  {!r.correct ? (
                    <p className="mt-1 text-base">
                      Best answer:{" "}
                      <strong>
                        {LETTERS[r.correctIndex]}: {r.options[r.correctIndex]}
                      </strong>
                    </p>
                  ) : null}
                  <div className="mt-3 flex items-center gap-3">
                    <PlayButton
                      size={44}
                      playing={playingKey === `e-${r.questionId}`}
                      onToggle={() =>
                        playAudio(explanationAudio[r.questionId], `e-${r.questionId}`)
                      }
                      label={
                        playingKey === `e-${r.questionId}`
                          ? "Pause the explanation"
                          : "Play the explanation aloud"
                      }
                    />
                    <p className="text-sm font-semibold" style={{ color: "var(--dim)" }}>
                      {playingKey === `e-${r.questionId}`
                        ? "Playing the explanation..."
                        : "Hear the explanation"}
                    </p>
                  </div>
                  <p className="mt-3 text-base leading-relaxed">{r.explanation}</p>
                  <div
                    className="mt-3 rounded-[var(--radius)] p-3"
                    style={{ background: "var(--surface2)" }}
                  >
                    <p className="text-sm">
                      <span className="font-display font-bold" style={{ color: "var(--accent)" }}>
                        Exam trap:{" "}
                      </span>
                      {r.trap}
                    </p>
                  </div>
                  <TermLookup
                    label="Terms in this explanation: tap to look one up"
                    termIds={r.glossaryTermIds}
                    termsById={termsById}
                    openTermId={openTermId}
                    onToggleTerm={toggleOpenTerm}
                    playingKey={playingKey}
                    onToggleAudio={toggleTermAudio}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {view === "results" && summary && summary.kind !== "mock" && (
          <section className="pt-6">
            <h1 className="font-display text-3xl font-bold">Set complete</h1>
            <p className="mt-2 text-base" style={{ color: "var(--dim)" }}>
              {SESSION_KIND_LABELS[summary.kind] ?? "Scenario practice"} ·{" "}
              {summary.correct} of {summary.answered} correct.
            </p>
            <div
              className="mt-5 rounded-[var(--radius)] p-5 text-center"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <p className="text-sm" style={{ color: "var(--dim)" }}>
                {summary.kind === "chart"
                  ? "Chart accuracy"
                  : summary.kind === "formula"
                    ? "Drill accuracy"
                    : "Weighted score for this set"}
              </p>
              <p className="font-display text-6xl font-bold">
                {summary.kind !== "scenario"
                  ? `${summary.answered > 0 ? Math.round((summary.correct / summary.answered) * 100) : 0}%`
                  : summary.weightedScore === null
                    ? "No data"
                    : `${summary.weightedScore}%`}
              </p>
              {summary.kind === "scenario" && summary.coveredWeight < 100 ? (
                <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
                  Weighted across the {summary.coveredWeight}% of exam weight covered in this set.
                </p>
              ) : null}
              {summary.weakestTopic ? (
                <p className="mt-2 text-base">
                  Weakest topic this set: <strong>{summary.weakestTopic}</strong>. It is on your
                  gap analysis page.
                </p>
              ) : null}
            </div>
            {summary.kind === "scenario" ? (
              <div className="mt-4 grid gap-3">
                {summary.domains
                  .filter((d) => d.attempted > 0)
                  .map((d) => (
                    <DomainBar
                      key={d.key}
                      name={d.name}
                      weight={d.weight}
                      accuracy={d.accuracy}
                      attempted={d.attempted}
                      isWeakest={false}
                      color={DOMAIN_COLORS[d.key] ?? "var(--accent)"}
                    />
                  ))}
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setView("gap")}
                className="font-display rounded-full px-5 py-3 font-semibold"
                style={{ background: "var(--accent-strong)", color: "#ffffff" }}
              >
                View gap analysis
              </button>
              <button
                type="button"
                onClick={() => {
                  setSession(null);
                  setView("home");
                }}
                className="font-display rounded-full px-5 py-3 font-semibold"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                Back to practice
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
