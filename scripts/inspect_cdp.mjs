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
      const map = window.__map;
      if (!map) return 'No window.__map';
      
      // Let's inspect active vehicles and what getDeliveryRouteSplit does in the browser context
      // We can grab vehicles from the DOM or react if possible, or evaluate vehicles in App
      const debug = window.__debug || {};
      
      return {
        styleLoaded: map.isStyleLoaded(),
        sources: Object.keys(map.getStyle().sources),
        deliveryIncoming: map.getSource('delivery-incoming-routes') ? {
          loaded: map.getSource('delivery-incoming-routes').loaded(),
          data: map.getSource('delivery-incoming-routes')._data
        } : null,
        markersCount: Object.keys(window.__markers || {}).length,
      };
    })()`,
    returnByValue: true
  });

  console.log('EVAL RESULT:', JSON.stringify(evalRes.result ? evalRes.result.value : evalRes, null, 2));
  ws.close();
}
run();
