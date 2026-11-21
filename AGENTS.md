# Architecture rules

- Keep the sommelier expertise contract in a browser-safe shared module consumed by both text and live-voice server functions, so reasoning and evidence rules cannot drift between modes.
- Use the shared page metadata helper for leaf route titles and descriptions to keep brand and social metadata consistent without root-level preview images.
- Sommelier voice is browser speech recognition -> askCellarSommelier -> Google TTS (speakSommelier), not Gemini Live: one deliberate reasoning path for text and voice.
- Keep microphone utterance completion in a browser-safe, tested speech-turn coordinator; browser recognition endpoints must preserve accumulated speech rather than submit partial sentences.
- Assemble speech recognition by result index and collapse exact cumulative hypotheses in the shared speech module, so browser revisions cannot multiply partial phrases.
- Stream sommelier HTTP replies through an authenticated server route using the same server-only reasoning helper as the text RPC; heartbeat chunks prevent idle disconnections without reducing deliberation.
- Keep offline inventory in account-keyed IndexedDB snapshots and clear it on sign-out; only public code and client-rendered shells belong in the service worker cache, never auth, API data or private audio.
- Apply EXIF orientation and bounded image sizing in the shared upload normalizer before storage, including AI-cleaned output; never infer a photo's orientation.
- Keep restaurant list validation in a shared browser-safe schema without silently truncating extracted rows.
