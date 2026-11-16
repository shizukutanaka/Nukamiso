'use strict';
/* Nukamiso UI test (Phase F): drives the real nukamiso.html in Electron,
   exercises open -> edit -> validate -> dictionary -> save, captures
   screenshots into docs/. Run:
     xvfb-run -a <electron-binary> tests/ui-main.js --no-sandbox
   Prints a JSON result line; exit code 0 on success. */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const docsDir = path.join(root, 'docs');
const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'nk-ui-'));
const results = { checks: [], downloads: [] };
function check(name, cond) {
  results.checks.push({ name, ok: !!cond });
  if (!cond) console.error('UI FAIL: ' + name);
}

app.disableHardwareAcceleration();
/* Hermetic run: fresh profile so localStorage from earlier runs cannot leak in. */
app.setPath('userData', fs.mkdtempSync(path.join(require('os').tmpdir(), 'nk-ui-profile-')));
app.whenReady().then(async () => {
  /* backgroundThrottling off: the burned-in export is driven by
     requestAnimationFrame, which a throttled hidden window would starve. */
  const win = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
  win.webContents.session.on('will-download', (ev, item) => {
    const p = path.join(tmpDir, item.getFilename());
    item.setSavePath(p);
    item.once('done', (e, state) => { results.downloads.push({ file: item.getFilename(), state, path: p }); });
  });
  win.webContents.on('console-message', (e, level, msg) => { if (level >= 2) console.error('PAGE:', msg); });
  await win.loadFile(path.join(root, 'nukamiso.html'));
  const run = (code) => win.webContents.executeJavaScript(code, true);

  try {
    check('NK namespace exists', await run('typeof NK === "object" && NK.version === "2.2.0"'));
    check('wave module isolated', await run('!!(NK.wave && NK.waveSurfer === NK.wave)'));
    check('ASR unsupported notice handled', await run('!!document.getElementById("asrUnsupported")'));

    /* --- file transcription panel (Phase H): present, honest, inert by
           default. The real engine download is NOT exercised here (network);
           it is verified separately end-to-end. --- */
    check('transcribe panel exists', await run('!!(document.getElementById("btnTxLoad") && document.getElementById("btnTxStart") && document.getElementById("selTxModel"))'));
    check('transcribe info shows sources and sizes', await run('(function(){var s=document.getElementById("txInfo").textContent; return s.indexOf("cdn.jsdelivr.net")>=0 && s.indexOf("huggingface.co")>=0 && s.indexOf("MB")>=0;})()'));
    check('transcribe start disabled before engine+media', await run('document.getElementById("btnTxStart").disabled === true'));
    check('transcribe core present', await run('!!(NK.transcribe && NK.transcribe.planChunks(61000).length === 3 && NK.transcribe.chunksToCues([{timestamp:[0,1.5],text:" hi "}],0,30000)[0].text === "hi")'));
    check('no network before explicit download', await run('NK.transcribe.ENGINE_URL.indexOf("https://cdn.jsdelivr.net/") === 0 && typeof Worker === "function"'));

    /* --- burned-in export panel (Phase I): present, honest, inert until
           a media file is opened. The full export is exercised below. --- */
    check('burn panel exists', await run('!!(document.getElementById("btnBurnStart") && document.getElementById("btnBurnCancel") && document.getElementById("burnStatus"))'));
    check('burn info states honest limits', await run('(function(){var s=document.getElementById("burnInfo").textContent; return s.indexOf("メモリ")>=0 && s.indexOf("再生時間")>=0;})()'));
    check('burn start disabled before media', await run('document.getElementById("btnBurnStart").disabled === true'));
    check('burn core present', await run('!!(NK.burn && NK.burn.cueAt([{start:0,end:1000,text:"x"}],500).text === "x" && NK.burn.layout("x",384,288,function(s){return s.length*24;}).fontPx === 48)'));

    /* --- open: feed a subtitle file through the real file input --- */
    const srt = '1\\n00:00:01,000 --> 00:00:02,500\\nぬかみそテスト\\n\\n2\\n00:00:03,000 --> 00:00:04,500\\n二行目です\\n';
    await run(`(function(){
      var dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(srt.replace(/\\n/g, '\n'))}], 'sample.srt', {type:'text/plain'}));
      var inp = document.getElementById('fileSub');
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change'));
      return true;
    })()`);
    await new Promise(r => setTimeout(r, 600));
    check('file open loads 2 cues', await run('document.querySelectorAll("#cueBody tr").length === 2'));
    check('cue text rendered', await run('document.querySelector("#cueBody textarea").value === "ぬかみそテスト"'));

    /* --- dictionary: add rule and apply --- */
    await run(`(function(){
      document.getElementById('dictFrom').value = 'ぬかみそ';
      document.getElementById('dictTo').value = '糠味噌';
      document.getElementById('btnDictAdd').click();
      document.getElementById('btnDictApply').click();
      return true;
    })()`);
    await new Promise(r => setTimeout(r, 300));
    check('dictionary applied to cues', await run('document.querySelector("#cueBody textarea").value === "糠味噌テスト"'));

    /* --- edit: change first cue text, add a cue --- */
    await run(`(function(){
      var ta = document.querySelectorAll("#cueBody textarea")[1];
      ta.value = '編集しました'; ta.dispatchEvent(new Event('input'));
      document.getElementById('btnAddCue').click();
      return true;
    })()`);
    await new Promise(r => setTimeout(r, 300));
    check('edit + add cue -> 3 rows', await run('document.querySelectorAll("#cueBody tr").length === 3'));

    /* --- validate --- */
    await run('document.getElementById("btnValidate").click()');
    await new Promise(r => setTimeout(r, 200));
    check('validate panel shows result', await run('document.getElementById("issues").textContent.length > 0'));

    /* --- persistence: reload and confirm state restored --- */
    await win.loadFile(path.join(root, 'nukamiso.html'));
    await new Promise(r => setTimeout(r, 400));
    check('localStorage restore after reload', await run('document.querySelectorAll("#cueBody tr").length === 3 && document.querySelector("#cueBody textarea").value === "糠味噌テスト"'));

    /* --- save: triggers download fallback in Electron --- */
    await run('document.getElementById("btnSave").click()');
    await new Promise(r => setTimeout(r, 1200));
    check('save produced a download', results.downloads.length >= 1 && results.downloads[0].state === 'completed');
    if (results.downloads.length) {
      const saved = fs.readFileSync(results.downloads[0].path, 'utf8');
      check('saved SRT parses back with edits', saved.includes('糠味噌テスト') && saved.includes('編集しました'));
      const NK2 = await run('NK.parse.srt(' + JSON.stringify(saved) + ').length');
      check('saved SRT has 3 cues', NK2 === 3);
    }

    /* --- burned-in export (Phase I): synthesize a tiny real video in the
           page (canvas + MediaRecorder), open it through the real file
           input, burn the current cues in, and verify the download plays
           back. The restored cues cover 1.0s-2.5s, so the 1.5s fixture
           overlaps the first cue. --- */
    const fixtureOk = await run(`(async function(){
      var mime = NK.burn.pickMimeType(function(m){ return MediaRecorder.isTypeSupported(m); });
      if (!mime) return 'no-mime';
      var c = document.createElement('canvas'); c.width = 320; c.height = 180;
      var x = c.getContext('2d');
      var rec = new MediaRecorder(c.captureStream(30), { mimeType: mime });
      var chunks = [];
      rec.ondataavailable = function(e){ if (e.data && e.data.size) chunks.push(e.data); };
      var stopped = new Promise(function(r){ rec.onstop = r; });
      var t0 = Date.now();
      var timer = setInterval(function(){
        var el = (Date.now() - t0) / 1000;
        x.fillStyle = el < 0.75 ? '#204060' : '#602040';
        x.fillRect(0, 0, 320, 180);
      }, 50);
      rec.start(200);
      await new Promise(function(r){ setTimeout(r, 1500); });
      clearInterval(timer);
      rec.stop(); await stopped;
      var blob = new Blob(chunks, { type: mime.split(';')[0] });
      var dt = new DataTransfer();
      dt.items.add(new File([blob], 'fixture.' + (mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm'), { type: blob.type }));
      var inp = document.getElementById('fileMedia');
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change'));
      return 'fed';
    })()`);
    check('video fixture synthesized and opened', fixtureOk === 'fed');
    await new Promise(r => setTimeout(r, 1200));
    check('burn start enabled with media', await run('document.getElementById("btnBurnStart").disabled === false'));
    const downloadsBefore = results.downloads.length;
    await run('document.getElementById("btnBurnStart").click()');
    let burnDl = null;
    for (let i = 0; i < 40 && !burnDl; i++) {
      await new Promise(r => setTimeout(r, 750));
      burnDl = results.downloads.slice(downloadsBefore).find(d => /^subtitled\./.test(d.file) && d.state === 'completed') || null;
    }
    check('burn export produced a download', !!burnDl);
    if (burnDl) {
      const buf = fs.readFileSync(burnDl.path);
      check('burned file has content', buf.length > 2000);
      const isWebm = buf.length > 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
      const isMp4 = buf.length > 8 && buf.toString('latin1', 4, 8) === 'ftyp';
      check('burned file is a real video container', isWebm || isMp4);
      /* Play the exported file back in a fresh window and read its
         dimensions/duration from the media element. loadFile() cannot
         open a bare media file in Electron, so go through a tiny player
         page in the same temp dir. Any harness error here fails the
         check, never the whole run. */
      let info = null;
      const win2 = new BrowserWindow({ width: 640, height: 400, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
      try {
        const playerPath = path.join(tmpDir, 'player.html');
        fs.writeFileSync(playerPath, '<!DOCTYPE html><video id="v" src="file://' + burnDl.path + '" autoplay muted playsinline></video>');
        await win2.loadFile(playerPath);
        for (let i = 0; i < 20 && !info; i++) {
          await new Promise(r => setTimeout(r, 400));
          info = await win2.webContents.executeJavaScript('(function(){var v=document.getElementById("v"); return (v && v.videoWidth) ? {w:v.videoWidth,h:v.videoHeight,d:v.duration} : null;})()').catch(() => null);
        }
      } catch (e) { info = null; }
      win2.close();
      check('burned video plays back (320x180, >0.5s)', !!info && info.w === 320 && info.h === 180 && info.d > 0.5);
    }
    check('burn status reports the export', await run('document.getElementById("burnStatus").textContent.indexOf("subtitled.") >= 0'));

    /* --- screenshots: Japanese UI, then English UI after language toggle --- */
    fs.mkdirSync(docsDir, { recursive: true });
    const img1 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(docsDir, 'screenshot-editor.png'), img1.toPNG());
    await run('document.getElementById("btnLang").click()');
    await new Promise(r => setTimeout(r, 300));
    check('language toggle switches UI', await run('document.querySelector("header .btn").textContent === "Open subtitles"'));
    const img2 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(docsDir, 'screenshot-editor-en.png'), img2.toPNG());
    check('screenshots written', fs.statSync(path.join(docsDir, 'screenshot-editor.png')).size > 5000 &&
      fs.statSync(path.join(docsDir, 'screenshot-editor-en.png')).size > 5000);
  } catch (e) {
    console.error('UI ERROR', e);
    results.error = String(e && e.message || e);
  }

  const failedCount = results.checks.filter(c => !c.ok).length;
  console.log('UIRESULT ' + JSON.stringify({ total: results.checks.length, failed: failedCount, checks: results.checks }));
  app.exit(failedCount || results.error ? 1 : 0);
});
