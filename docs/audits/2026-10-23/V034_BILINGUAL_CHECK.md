# Installed v0.3.4: short bilingual audio check

Date: 2026-10-23. Installed `/Applications/CoqPi.app`, Electron 44.9.3.
ASAR SHA-256: `6464af0f09243afd210bd25b5a91fb80a841b09d4ddca21f6b72cff8f022c5d9`.

## Method

Three synthetic spoken questions, EN -> FR -> EN, through macOS speech output,
BlackHole, real WebRTC STT and assistant API. Isolated data and default context;
no personal CV/context and no mocks. Owner authorized paid testing up to USD 1.
One short run only; not an acoustic, long-call or personalized-answer validation.
UI observations sampled approximately every 250 ms after playback ended.

## Timing

Seconds from end of playback; first text can be partial.

| Turn | First Russian translation | First answer text | Complete answer |
| --- | ---: | ---: | ---: |
| English | 3.364 | 3.620 | 4.137 |
| French | 2.368 | 2.627 | 3.148 |
| English again | 2.303 | 2.558 | 3.074 |

Final STT latency: 1.397 / 1.136 / 1.132 seconds, respectively.

## Passed

- Three finalized OTHER/system segments have languages en/fr/en.
- Suggested response language follows EN -> FR -> EN; meaning is Russian.
- French transcript preserves 15,000 versus 50,000, 27 November, and the
  requirement not to reduce testing. Raw normalized WER is 4/64 (6.25%);
  observed differences include spelling, contraction and numeric formatting.
- All three segments survive Stop and a complete application close/reopen.
- Stop-to-ready observation: 58 ms after the click returned (not total click latency).
- Microphone and system WAVs saved, with declared PCM lengths matching file sizes.
- No renderer errors observed. Personal archive/settings were not used or modified.

## Failed quality checks

1. French answer contradicts a hard constraint. The question says
   `sans réduire les tests`, but the answer suggests `des tests essentiels seulement`.
   Correct transcription/translation does not establish answer correctness.
2. On return to English, Russian meaning repeats the first English question before
   translating the latest one. The answer also repeats first-month planning content.
   Prior conversation may inform an answer, but must not be presented as the latest utterance.

Next fix: distinguish the latest utterance from conversation history in the brief
prompt, explicitly preserve constraints/negations, and add these two synthetic
regression fixtures before another bounded real-audio run.

## Evidence and limits

Local ignored evidence: `tmp/real-user-acceptance/coqpi-acceptance-AnPB0F`.
Full local driver output: `/private/tmp/coqpi-bilingual-034.log`.
No raw audio, credentials or personal data are included in this document.
Exact provider billing was not retrieved. No claim of long-call reliability,
consistent latency or full acceptance is made from these three turns.

## Targeted fix and repeat run

The live App request now includes an explicit `latestIncomingUtterance` from the
latest finalized eligible OTHER turn. The existing transcript remains background.
The latest turn passes through the privacy gate. System and brief instructions
preserve constraints in the answer as well as the translation, without an extra
provider call. Review/coaching retain their full-conversation behavior.

Regression: mocked EN -> FR -> EN requests assert latest-turn separation,
constraint policy and requested language. This validates the request contract,
not model semantics. Full isolated `pnpm check`: 373 passed; zero known advisories.
The initial sandbox run failed on legacy tests' external storage/local HTTP
access; the passing run used temporary data directories, not personal storage.

Real-audio repeat: `coqpi-acceptance-ugWfGq` using the same three questions.
Candidate ASAR: `e4554247f14984180e6085ddea2eb84408e6ddcd2b855a2204c4da551df1301e`.
This is a local patched v0.3.4 build, not a replacement GitHub release asset.

| Turn | First Russian translation | First answer text | Complete answer |
| --- | ---: | ---: | ---: |
| English | 2.947 s | 3.204 s | 3.466 s |
| French | 4.110 s | 4.365 s | 4.881 s |
| English again | 2.559 s | 2.559 s | 3.074 s |

Observed targeted outcomes:
- French reply proposes revisiting the plan/priorities, not reducing testing;
  budget and deadline remain intact. It is a clarification, not a feasibility guarantee.
- Last Russian translation contains only the latest English turn, and the answer
  addresses changed deadline / unchanged budget without repeating month-one planning.
- Three OTHER/system segments survive Stop and reopening unchanged; both WAV headers
  match file lengths. Stop-to-ready observation: 37 ms. No renderer errors.
- Raw WER 6/64 reflects number formatting (spoken French numbers versus digits);
  manual review confirms the amounts, date and negation survived.

Remaining limitations: French final-answer latency rose to 4.9 seconds in this
sample; no speedup is claimed. The last Russian translation has a grammatical
defect (`если бы срок изменения`) but no repeated old question. These three
synthetic turns do not guarantee semantic correctness on every real conversation.
