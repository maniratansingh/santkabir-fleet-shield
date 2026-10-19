async function testTV() {
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

  console.log('Enabling TV mode...');
  // Click TV mode button in floating controls
  await send('Runtime.evaluate', {
    expression: `(() => {
      const tvBtn = document.querySelector('button[title*=\"Auto-Tour\"]');
      if (tvBtn) tvBtn.click();
      return Boolean(tvBtn);
    })()`
  });

  // Track state over 10 seconds
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const step = await send('Runtime.evaluate', {
      expression: `(() => {
        const toast = document.querySelector('.glass-panel.px-4.py-2.rounded-full');
        const sheet = document.querySelector('.glass-panel.rounded-3xl');
        const selected = document.querySelector('.is-selected');
        return {
          i: ${i},
          zoom: window.__map ? window.__map.getZoom() : 0,
          toast: toast ? toast.textContent.trim() : null,
          sheetHeight: sheet ? sheet.offsetHeight : 0,
          selectedId: selected ? (selected.querySelector('.marker-id') ? selected.querySelector('.marker-id').textContent : 'has-selected') : 'none'
        };
      })()`,
      returnByValue: true
    });
    console.log(`[${i}s]`, JSON.stringify(step.result.value));
  }

  // Turn off TV mode
  await send('Runtime.evaluate', {
    expression: `(() => {
      const tvBtn = document.querySelector('button[title*=\"Auto-Tour\"]');
      if (tvBtn) tvBtn.click();
    })()`
  });
  ws.close();
}
testTV();
