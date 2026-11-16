'use strict';
/* Nukamiso core tests (Phase F / G-2). Zero-dependency: plain Node.
   Extracts the NK CORE section from nukamiso.html and exercises it.
   Run: node tests/run-tests.js */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'nukamiso.html'), 'utf8');
const m = html.match(/\/\* ==== NK CORE BEGIN ==== \*\/([\s\S]*?)\/\* ==== NK CORE END ==== \*\//);
if (!m) { console.error('FAIL: NK CORE section not found in nukamiso.html'); process.exit(1); }
global.window = {};
eval(m[1]);
const NK = global.window.NK;
if (!NK) { console.error('FAIL: NK not defined by core section'); process.exit(1); }

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + name); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' (got ' + JSON.stringify(a) + ')'); }
function cueEq(a, b) {
  return a.length === b.length && a.every((c, i) => c.start === b[i].start && c.end === b[i].end && c.text === b[i].text);
}

/* ---- namespace / philosophy flags ---- */
eq(NK.version, '2.1.0', 'NK.version');
ok(NK.config.zeroDep && NK.config.singleFile && NK.config.localFirst && NK.config.zeroTelemetry, 'NK.config flags');
ok(NK.features.phaseA && NK.features.phaseB && NK.features.phaseC && NK.features.phaseD && NK.features.phaseE && NK.features.phaseH, 'NK.features phases');

/* ---- time ---- */
eq(NK.time.parse('00:00:01,000'), 1000, 'parse srt time');
eq(NK.time.parse('01:02:03.500'), 3723500, 'parse vtt time');
eq(NK.time.parse('02:03.25'), 123250, 'parse MM:SS.mmm');
eq(NK.time.formatSRT(3723500), '01:02:03,500', 'formatSRT');
eq(NK.time.formatVTT(3723500), '01:02:03.500', 'formatVTT');
eq(NK.time.formatASS(3723500), '1:02:03.50', 'formatASS');
eq(NK.time.parseASS('1:02:03.50'), 3723500, 'parseASS round trip');
ok(isNaN(NK.time.parse('garbage')), 'parse garbage is NaN');
for (const ms of [0, 1, 999, 1000, 61001, 3599999, 3600000, 86399999]) {
  eq(NK.time.parse(NK.time.formatSRT(ms)), ms, 'srt time round trip ' + ms);
  eq(NK.time.parseASS(NK.time.formatASS(ms)), Math.round(ms / 10) * 10, 'ass time round trip ' + ms);
}

/* ---- SRT round trip ---- */
const sample = [
  { start: 1000, end: 2500, text: 'Hello world' },
  { start: 3000, end: 4750, text: 'Line one\nLine two' },
  { start: 60000, end: 62500, text: '一分です' }
];
ok(cueEq(NK.parse.srt(NK.serialize.srt(sample)), sample), 'SRT round trip');
ok(cueEq(NK.parse.vtt(NK.serialize.vtt(sample)), sample), 'VTT round trip');
ok(cueEq(NK.parse.ass(NK.serialize.ass(sample)), sample), 'ASS round trip');
/* TXT is a plain line format: a multi-line cue occupies multiple lines,
   so the round trip preserves the sequence of text lines. */
eq(NK.parse.txt(NK.serialize.txt(sample)).map(c => c.text),
   sample.reduce((acc, c) => acc.concat(c.text.split('\n')), []),
   'TXT round trip preserves text lines');

/* parse known documents */
const srtDoc = '1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n';
eq(NK.parse.srt(srtDoc), [{ start: 1000, end: 2500, text: 'Hello' }, { start: 3000, end: 4000, text: 'World' }], 'parse SRT doc');
const vttDoc = 'WEBVTT\n\n00:01.000 --> 00:02.500\nHello\n';
eq(NK.parse.vtt(vttDoc), [{ start: 1000, end: 2500, text: 'Hello' }], 'parse VTT doc (MM:SS)');
const assDoc = '[Script Info]\nTitle: x\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,Hello, world\\Nsecond line\n';
eq(NK.parse.ass(assDoc), [{ start: 1000, end: 2500, text: 'Hello, world\nsecond line' }], 'parse ASS doc (commas in text, \\N)');

/* detection */
eq(NK.detectFormat(srtDoc), 'srt', 'detect srt');
eq(NK.detectFormat(vttDoc), 'vtt', 'detect vtt');
eq(NK.detectFormat(assDoc), 'ass', 'detect ass');
eq(NK.detectFormat('just some words'), 'unknown', 'detect unknown');

/* ---- nkValidate ---- */
const vOk = NK.nkValidate(srtDoc);
eq(vOk.format, 'srt', 'nkValidate format srt');
eq(vOk.issues, [], 'nkValidate clean doc has no issues');
const vUnknown = NK.nkValidate('just some words\nno timestamps here');
eq(vUnknown.format, 'unknown', 'nkValidate unknown format');
ok(Array.isArray(vUnknown.issues) && vUnknown.issues.length >= 1, 'nkValidate unknown STILL returns issues (Phase E regression)');
const vEmpty = NK.nkValidate('');
ok(Array.isArray(vEmpty.issues) && vEmpty.issues.length >= 1, 'nkValidate empty returns issues');
const vNull = NK.nkValidate(null);
ok(Array.isArray(vNull.issues), 'nkValidate null returns issues');
const badCues = NK.serialize.srt([{ start: 5000, end: 4000, text: '' }, { start: 4500, end: 9000, text: 'x'.repeat(50) }]);
const vBad = NK.nkValidate(badCues);
ok(vBad.issues.some(i => i.level === 'error'), 'nkValidate flags end<=start as error');
ok(vBad.issues.some(i => /overlap/.test(i.message)), 'nkValidate flags overlap');
ok(vBad.issues.some(i => /empty/.test(i.message)), 'nkValidate flags empty text');
ok(vBad.issues.some(i => /long/.test(i.message)), 'nkValidate flags long line');

/* ---- dictionary ---- */
const dict = [{ from: 'ぬかみそ', to: '糠味噌' }, { from: '糠', to: 'ぬか' }];
eq(NK.dict.apply('ぬかみそと糠', dict), '糠味噌とぬか', 'dict apply longest-first');
eq(NK.dict.applyToCues([{ start: 0, end: 1, text: 'ぬかみそ' }], dict)[0].text, '糠味噌', 'dict applyToCues');
eq(NK.dict.apply('unchanged', []), 'unchanged', 'dict empty entries');

/* ---- cue ops ---- */
eq(NK.cues.shift([{ start: 1000, end: 2000, text: 'a' }], -1500), [{ start: 0, end: 500, text: 'a' }], 'shift clamps at 0');
const sp = NK.cues.split([{ start: 0, end: 4000, text: 'a\nb' }], 0);
eq(sp, [{ start: 0, end: 2000, text: 'a' }, { start: 2000, end: 4000, text: 'b' }], 'split at newline');
const mg = NK.cues.merge(sp, 0);
eq(mg, [{ start: 0, end: 4000, text: 'a\nb' }], 'merge rejoins');

/* ---- fuzz: parsers never throw, round trips hold (seeded, deterministic) ---- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261115);
const words = ['hello', 'world', '糠味噌', 'subtitle', 'テスト', 'a,b', 'x --> y', '{\\pos(1,2)}tag', 'line', '🎙', ''];
function randText() {
  /* Real cue text never contains blank lines (SRT/VTT cannot represent them),
     so generate 1-2 non-empty lines. */
  if (rand() < 0.05) return '';
  const lines = [];
  const nLines = 1 + Math.floor(rand() * 2);
  for (let li = 0; li < nLines; li++) {
    const n = 1 + Math.floor(rand() * 3);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const w = words[Math.floor(rand() * words.length)];
      if (w) parts.push(w);
    }
    lines.push(parts.join(' ') || 'x');
  }
  return lines.join('\n');
}
let fuzzFail = 0;
for (let iter = 0; iter < 3000; iter++) {
  const n = Math.floor(rand() * 6);
  const cues = [];
  let t0 = Math.floor(rand() * 10000);
  for (let i = 0; i < n; i++) {
    const dur = 100 + Math.floor(rand() * 5000);
    cues.push({ start: t0, end: t0 + dur, text: randText() });
    t0 += dur + Math.floor(rand() * 2000);
  }
  for (const fmt of ['srt', 'vtt', 'ass']) {
    try {
      /* ASS timestamps have centisecond precision by specification:
         expected times are rounded to 10ms for that format. */
      const expect = fmt === 'ass'
        ? cues.map(c => ({ start: Math.round(c.start / 10) * 10, end: Math.round(c.end / 10) * 10, text: c.text }))
        : cues;
      const back = NK.parse[fmt](NK.serialize[fmt](cues));
      // ASS strips override tags on parse; strict text compare only for tag-free texts
      const tagFree = cues.every(c => !/[{}]/.test(c.text));
      if (back.length !== expect.length) { fuzzFail++; if (fuzzFail < 5) console.error('FUZZ count mismatch', fmt, iter); }
      else if (tagFree && !cueEq(back, expect)) { fuzzFail++; if (fuzzFail < 5) console.error('FUZZ round trip mismatch', fmt, iter, JSON.stringify(expect), JSON.stringify(back)); }
      else if (!back.every((c, i) => c.start === expect[i].start && c.end === expect[i].end)) { fuzzFail++; if (fuzzFail < 5) console.error('FUZZ time mismatch', fmt, iter); }
    } catch (e) { fuzzFail++; if (fuzzFail < 5) console.error('FUZZ threw', fmt, iter, e.message); }
  }
}
ok(fuzzFail === 0, 'fuzz round trips (3000 iters x 3 formats)');

/* garbage input must never throw and nkValidate must always return issues */
const garbagePieces = ['-->', '00:00', '\n\n\n', 'WEBVTT', 'Dialogue:', '{', '}', '🎙'.repeat(50), '0:0:0.0', ',,,', 'Format:', '[Events]', 'null', ' '];
let garbageFail = 0;
for (let iter = 0; iter < 2000; iter++) {
  let s = '';
  const n = Math.floor(rand() * 8);
  for (let i = 0; i < n; i++) s += garbagePieces[Math.floor(rand() * garbagePieces.length)] + (rand() < 0.5 ? '\n' : ' ');
  try {
    NK.parse.srt(s); NK.parse.vtt(s); NK.parse.ass(s); NK.parse.txt(s);
    const v = NK.nkValidate(s);
    if (!Array.isArray(v.issues)) { garbageFail++; console.error('FUZZ validate missing issues', iter); }
  } catch (e) { garbageFail++; console.error('FUZZ garbage threw', iter, e.message); }
}
ok(garbageFail === 0, 'fuzz garbage inputs (2000 iters) never throw');

/* ---- file transcription planning/conversion (Phase H) ---- */
const TX = NK.transcribe;
ok(!!TX, 'NK.transcribe exists');
ok(/^https:\/\/cdn\.jsdelivr\.net\//.test(TX.ENGINE_URL) && TX.ENGINE_URL.includes('@3.7.2'), 'engine URL is pinned (Transformers.js 3.7.2 on jsDelivr)');
eq(TX.MODELS.length, 2, 'two models offered');
ok(TX.MODELS.every(m => /^Xenova\/whisper-/.test(m.id) && m.sizeMB > 0 && m.labelJa && m.labelEn), 'model metadata complete');
ok(TX.ENGINE_SIZE_MB > 0 && TX.SAMPLE_RATE === 16000 && TX.CHUNK_MS === 30000, 'transcribe constants');

/* chunk planning */
eq(TX.planChunks(0), [], 'planChunks zero duration');
eq(TX.planChunks(-5000), [], 'planChunks negative duration');
eq(TX.planChunks(NaN), [], 'planChunks NaN duration');
eq(TX.planChunks(11000), [{ startMs: 0, endMs: 11000 }], 'planChunks short file = one chunk');
eq(TX.planChunks(61000), [
  { startMs: 0, endMs: 30000 }, { startMs: 30000, endMs: 60000 }, { startMs: 60000, endMs: 61000 }
], 'planChunks 61s = 30+30+1');
eq(TX.planChunks(60000), [
  { startMs: 0, endMs: 30000 }, { startMs: 30000, endMs: 60000 }
], 'planChunks exact multiple has no empty tail');
eq(TX.planChunks(25000, 10000), [
  { startMs: 0, endMs: 10000 }, { startMs: 10000, endMs: 20000 }, { startMs: 20000, endMs: 25000 }
], 'planChunks custom chunk size');

/* whisper chunks -> cues */
eq(TX.chunksToCues([{ timestamp: [0, 2.5], text: ' Hello ' }, { timestamp: [2.5, 4], text: 'world' }], 0, 30000),
   [{ start: 0, end: 2500, text: 'Hello' }, { start: 2500, end: 4000, text: 'world' }],
   'chunksToCues basic conversion + trim');
eq(TX.chunksToCues([{ timestamp: [1, 2], text: 'x' }], 30000, 60000),
   [{ start: 31000, end: 32000, text: 'x' }], 'chunksToCues applies window offset');
eq(TX.chunksToCues([{ timestamp: [28, null], text: 'tail' }], 0, 30000),
   [{ start: 28000, end: 30000, text: 'tail' }], 'chunksToCues null end uses window end');
eq(TX.chunksToCues([{ timestamp: [28, null], text: 'tail' }], 0),
   [{ start: 28000, end: 30000, text: 'tail' }], 'chunksToCues null end without window defaults to +2s');
eq(TX.chunksToCues([{ timestamp: [0, 1], text: '   ' }, { timestamp: [1, 2], text: '' }], 0, 30000),
   [], 'chunksToCues drops empty segments');
eq(TX.chunksToCues([{ timestamp: [5, 5], text: 'zero' }], 0, 30000),
   [{ start: 5000, end: 5500, text: 'zero' }], 'chunksToCues enforces minimum cue length');
eq(TX.chunksToCues([{ timestamp: [29, 45], text: 'over' }], 0, 30000),
   [{ start: 29000, end: 30000, text: 'over' }], 'chunksToCues clamps end to window');
eq(TX.chunksToCues([{ timestamp: [3, 4], text: 'b' }, { timestamp: [1, 2], text: 'a' }], 0, 30000).map(c => c.text),
   ['a', 'b'], 'chunksToCues sorts by start');
eq(TX.chunksToCues(null, 0, 30000), [], 'chunksToCues null input');
eq(TX.chunksToCues(undefined), [], 'chunksToCues undefined input');
eq(TX.chunksToCues([{ text: 'no ts' }, { timestamp: ['x', 'y'], text: 'bad' }, null, 42], 0, 30000),
   [], 'chunksToCues skips malformed segments without throwing');

/* language mapping */
eq(TX.languageName('ja-JP'), 'japanese', 'languageName ja');
eq(TX.languageName('en-US'), 'english', 'languageName en');
eq(TX.languageName('fr-FR'), undefined, 'languageName unknown -> auto-detect');

console.log('tests: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
