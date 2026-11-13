// R2 primary glossary audio map (P0-3). The bundled copies in
// glossaryAudioBundled.ts are the runtime fallback used by the player in App.tsx.
import { AUDIO_BASE } from "./audioBase";
import { GLOSSARY_AUDIO_IDS } from "./audioIds";

export const glossaryAudio: Record<string, string> = Object.fromEntries(
  GLOSSARY_AUDIO_IDS.map((id) => [id, `${AUDIO_BASE}/g-${id}.mp3`]),
);
