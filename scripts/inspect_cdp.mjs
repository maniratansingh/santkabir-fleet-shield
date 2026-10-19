async function run() {
  const targetsRes = await fetch('http://127.0.0.1:9222/json');
  const targets = await targetsRes.json();
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

  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const markers = document.querySelectorAll('.marker-outer-wrapper');
      const dynamicIslandText = document.querySelector('.flex.items-center.gap-2.text-xs')?.textContent || '';
      const sheetCards = document.querySelectorAll('.marker-outer-wrapper');
      return {
        markerCount: markers.length,
        markerIds: Array.from(markers).map(m => m.querySelector('.marker-id')?.textContent),
        dynamicIslandText,
      };
    })()`,
    returnByValue: true
  });
  console.log('LIVE TELEMETRY RESULT:', JSON.stringify(evalRes.result.value, null, 2));

  // Capture screenshot of live 13-car telemetry
  const screenshotRes = await send('Page.captureScreenshot', { format: 'png' });
  const fs = await import('fs');
  const screenshotPath = '/Users/mrps/.gemini/antigravity/brain/7d354a9a-c354-4554-9af1-1ff9d31a9cfa/live_13_cars_telemetry.png';
  fs.writeFileSync(screenshotPath, Buffer.from(screenshotRes.data, 'base64'));
  console.log(`Saved screenshot to ${screenshotPath}`);

  ws.close();
}
run();
