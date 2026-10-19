async function traceMotion() {
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
  const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('localhost:3000'));
  const ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);
  let idCounter = 1;
  const pending = new Map();
  function send(method, params = {}) {
    const id = idCounter++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result);
    }
  };
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');

  const trace = [];
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 150));
    const res = await send('Runtime.evaluate', {
      expression: `(() => {
        // Inspect AMB-01 or first marker
        const m = window.__map;
        const amb1 = document.querySelector('.marker-id');
        const outer = amb1 ? amb1.closest('.marker-outer-wrapper') : null;
        const rect = outer ? outer.getBoundingClientRect() : null;
        const rotator = outer ? outer.querySelector('.ambulance-rotator') : null;
        return {
          t: performance.now(),
          rect: rect ? { x: Number(rect.x.toFixed(2)), y: Number(rect.y.toFixed(2)) } : null,
          rotatorTransform: rotator ? rotator.style.transform : null,
        };
      })()`,
      returnByValue: true
    });
    trace.push(res.result.value);
  }

  console.log('Trace sample (first 15):', JSON.stringify(trace.slice(0, 15), null, 2));
  
  // Calculate deltas
  const deltas = [];
  for (let i = 1; i < trace.length; i++) {
    const p0 = trace[i - 1].rect;
    const p1 = trace[i].rect;
    if (p0 && p1) {
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const dist = Math.hypot(dx, dy);
      deltas.push({ i, dt: trace[i].t - trace[i-1].t, dx, dy, dist, transform: trace[i].rotatorTransform });
    }
  }
  console.log('Deltas:', JSON.stringify(deltas.slice(0, 15), null, 2));

  ws.close();
}
traceMotion();
