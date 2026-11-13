// R2 primary audio map (P0-3). Every question and explanation recording is
// served from the Cloudflare R2 bucket pmp-audio. The bundled copies in
// audioMapBundled.ts are the runtime fallback used by the player in App.tsx.
import { AUDIO_BASE } from "./audioBase";
import { QUESTION_AUDIO_IDS } from "./audioIds";

export const questionAudio: Record<string, string> = Object.fromEntries(
  QUESTION_AUDIO_IDS.map((id) => [id, `${AUDIO_BASE}/${id}-q.mp3`]),
);

export const explanationAudio: Record<string, string> = Object.fromEntries(
  QUESTION_AUDIO_IDS.map((id) => [id, `${AUDIO_BASE}/${id}-e.mp3`]),
);
