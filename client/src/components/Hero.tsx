import { SafeAreaTopScrim } from "./SafeAreaTopScrim";

// Front door for the app: a full-screen welcome shown once on fresh load.
// Dismissing it is held in App component state only, so it never touches
// the localStorage store and never reappears during the same visit.
// Colors come from the theme.css variables (PMI palette) so it renders
// correctly in both light and dark modes; the logo gradient uses the
// PMI violet endpoints directly.

export function Hero({ onBegin }: { onBegin: () => void }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <svg
        className="h-28 w-28"
        viewBox="0 0 72 72"
        role="img"
        aria-label="PMP Prep Exam Simulator logo"
      >
        <defs>
          <linearGradient
            id="pmpHeroGradient"
            x1="0"
            y1="0"
            x2="72"
            y2="72"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#4F17A8" />
            <stop offset="100%" stopColor="#200F3B" />
          </linearGradient>
        </defs>
        <rect width="72" height="72" rx="18" fill="url(#pmpHeroGradient)" />
        <polyline
          points="16,46 29,25 37,36 56,17"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h1 className="font-display mt-8 max-w-xl text-4xl font-bold leading-tight sm:text-5xl">
        PMP Prep Exam Simulator
      </h1>
      <p className="mt-3 text-lg" style={{ color: "var(--dim)" }}>
        Voice-driven practice for the real exam.
      </p>
      <button
        type="button"
        onClick={onBegin}
        autoFocus
        className="mt-10 rounded-full px-10 py-3 text-lg font-semibold"
        style={{
          background: "var(--accent-strong)",
          color: "#ffffff",
          border: "1px solid var(--border)",
        }}
      >
        Begin
      </button>
    </div>
  );
}
