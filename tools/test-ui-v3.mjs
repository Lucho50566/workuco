// Uso: con un servidor con datos demo frescos (WORKUCO_DEMO=1 y base vacía) corriendo:
//   WK_BASE=http://localhost:4250 node tools/test-ui-v3.mjs
// Requiere Google Chrome instalado (usa el modo headless por CDP).
// Prueba de punta a punta del wizard en Chrome headless:
// 1) publica una changa desde la plantilla "Cosecha", 2) la edita sin cambios,
// 3) verifica que gig, inicio, duración, sueldo y habilidades sobrevivan.
import { spawn } from 'node:child_process';

const BASE = process.env.WK_BASE || 'http://localhost:4260';
const PORT = 9855 + Math.floor(Math.random() * 100);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\cdp-flow-${PORT}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const t = l.find((x) => x.type === 'page'); if (t) ws = new WebSocket(t.webSocketDebuggerUrl); } catch (_) { await sleep(250); }
}
await new Promise((r) => { ws.onopen = r; });
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pend.has(msg.id)) { pend.get(msg.id)(msg); pend.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description);
  if (msg.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
  return r.result?.result?.value;
};
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
const go = async (p) => { await send('Page.navigate', { url: BASE + p }); await sleep(1800); };

let ok = 0; let fail = 0;
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name} ${extra}`); } };

await go('/');
await ev(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'finca@demo.workuco',password:'demo12345'})}).then(r=>r.status)`);
await go('/publicar');
const click = (sel) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('no ${sel}'); el.click(); return true; })()`);
const setVal = (sel, v) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

await click('[data-tpl="cosecha"]'); await sleep(200);
check('plantilla completa el título', (await ev(`document.querySelector('#j-title').value`)) === 'Cosechadores para temporada');
check('plantilla marca changa', await ev(`document.querySelector('#j-gig').checked`));
await click('[data-loc="Tunuyán"]'); await click('[data-mod="Presencial"]');
await click('#wizard-next'); await sleep(300);
check('sin fecha de inicio no avanza', (await ev(`document.querySelector('.wizard-step:not([hidden])').dataset.step`)) === '1');
await setVal('#j-start', '2026-12-05'); await setVal('#j-duration', '3 semanas');
await click('#wizard-next'); await sleep(300);
check('paso 2 con descripción de la plantilla', (await ev(`document.querySelector('#j-description').value.length`)) > 60);
check('habilidades de la plantilla cargadas', (await ev(`document.querySelectorAll('#jskills-list .tag').length`)) === 3);
await click('#wizard-next'); await sleep(300);
check('el aviso de sueldo vacío se muestra', await ev(`!document.querySelector('#salary-nudge').hidden`));
await setVal('#j-salary-min', '34000');
check('el aviso desaparece al cargar sueldo', await ev(`document.querySelector('#salary-nudge').hidden`));
await click('#wizard-next'); await sleep(300);
check('la vista previa muestra el sueldo por día', /34\.000/.test(await ev(`document.querySelector('#job-preview').textContent`)));
await click('#job-submit'); await sleep(900);
const jobs = await ev(`fetch('/api/company/jobs').then(r=>r.json()).then(d=>d.jobs)`);
const j = jobs.find((x) => x.title === 'Cosechadores para temporada');
check('se creó la changa', !!j && j.gig && j.startDate === '2026-12-05' && j.duration === '3 semanas', JSON.stringify(j && { gig: j.gig, startDate: j.startDate, duration: j.duration }));
check('con sueldo por día y habilidades', !!j && j.salaryMin === 34000 && j.salaryPeriod === 'día' && j.skills.length === 3, JSON.stringify(j && { s: j.salaryMin, p: j.salaryPeriod, k: j.skills }));

await go(`/publicar?edit=${j.id}`);
check('al editar se cargan los campos de changa', await ev(`document.querySelector('#j-gig').checked && document.querySelector('#j-start').value === '2026-12-05'`));
for (let i = 0; i < 3; i++) { await click('#wizard-next'); await sleep(250); }
await click('#job-submit'); await sleep(900);
const after = (await ev(`fetch('/api/company/jobs').then(r=>r.json()).then(d=>d.jobs)`)).find((x) => x.id === j.id);
check('editar sin cambios conserva changa, sueldo y habilidades', after.gig && after.startDate === '2026-12-05' && after.salaryMin === 34000 && after.salaryPeriod === 'día' && after.skills.length === 3,
  JSON.stringify({ gig: after.gig, start: after.startDate, s: after.salaryMin, p: after.salaryPeriod, k: after.skills }));
/* XSS: un mensaje de invitación con HTML se muestra como texto */
const evil = '<img src=x onerror="window.__pwned=1">Hola';
await go('/');
await ev(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'bodega@demo.workuco',password:'demo12345'})}).then(r=>r.status)`);
const invStatus = await ev(`fetch('/api/company/invitations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:'jdemo008',candidateId:'udemo06',message:${JSON.stringify(evil)}})}).then(r=>r.status)`);
check('invitación con HTML creada', invStatus === 201 || invStatus === 409, String(invStatus));
await send('Network.enable'); await send('Network.clearBrowserCookies');
await go('/');
await ev(`fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'candidate',email:'camila@demo.workuco',password:'demo12345'})}).then(r=>r.status)`);
await go('/mi-perfil?tab=invitaciones');
check('el mensaje se muestra como texto', (await ev(`document.querySelector('#my-invites').textContent`)).includes('<img src=x'));
check('no se insertó ninguna imagen ni corrió código', await ev(`!document.querySelector('#my-invites img[src="x"]') && !window.__pwned`));
await click('[data-bell]'); await sleep(300);
check('la campanita muestra la invitación escapada', await ev(`!!document.querySelector('.bell-panel') && !document.querySelector('.bell-panel img[src="x"]') && !window.__pwned`));
check('sin errores de JS', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
console.log(`\n${ok} ok · ${fail} fail`);
ws.close(); proc.kill(); process.exit(fail ? 1 : 0);
