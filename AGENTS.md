# Architecture rules

- Keep the sommelier expertise contract in a browser-safe shared module consumed by both text and live-voice server functions, so reasoning and evidence rules cannot drift between modes.
- Use the shared page metadata helper for leaf route titles and descriptions to keep brand and social metadata consistent without root-level preview images.
- Sommelier voice is browser speech recognition -> askCellarSommelier -> Google TTS (speakSommelier), not Gemini Live: one deliberate reasoning path for text and voice.
- Keep microphone utterance completion in a browser-safe, tested speech-turn coordinator; browser recognition endpoints must preserve accumulated speech rather than submit partial sentences.
- Assemble speech recognition by result index and collapse exact cumulative hypotheses in the shared speech module, so browser revisions cannot multiply partial phrases.
