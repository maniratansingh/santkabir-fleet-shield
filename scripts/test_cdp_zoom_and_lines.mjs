import fs from 'fs';

async function main() {
  const targetsRes = await fetch('http://127.0.0.1:9222/json');
  const targets = await targetsRes.json();
  const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('localhost:3000'));
  if (!pageTarget) {
    console.error('No localhost:3000 page target found!');
    return;
  }

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
  await send('Page.enable');

  // Check state of the map, layers, zoom level, features
  const mapState = await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map;
      if (!map) return { error: 'No window.__map' };
      const layers = map.getStyle().layers.map(l => ({ id: l.id, type: l.type, visibility: map.getLayoutProperty(l.id, 'visibility') || 'visible' }));
      const incSource = map.getSource('delivery-incoming-routes');
      const trailSource = map.getSource('delivery-trail-routes');
      const incFeatures = incSource && incSource._data ? incSource._data.features : [];
      return {
        zoom: map.getZoom(),
        center: map.getCenter(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        layers: layers.filter(l => l.id.includes('delivery') || l.id.includes('camp') || l.id.includes('village')),
        incFeaturesCount: incFeatures.length,
        incFeaturesSample: incFeatures.slice(0, 3).map(f => ({
          vehicleId: f.properties.vehicleId,
          coordsCount: f.geometry ? f.geometry.coordinates.length : 0,
          firstCoord: f.geometry && f.geometry.coordinates[0],
          lastCoord: f.geometry && f.geometry.coordinates[f.geometry.coordinates.length - 1],
          lineColor: f.properties.lineColor,
          isSelected: f.properties.isSelected
        }))
      };
    })()`,
    returnByValue: true
  });

  console.log('MAP STATE:', JSON.stringify(mapState.result.value, null, 2));

  // Take screenshot at current zoom
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/mrps/.gemini/antigravity/brain/7d354a9a-c354-4554-9af1-1ff9d31a9cfa/test_cdp_current.png', Buffer.from(shot1.data, 'base64'));

  // Test zoom in
  console.log('Zooming in...');
  await send('Runtime.evaluate', {
    expression: `window.__map.setZoom(13.5);`
  });
  await new Promise(r => setTimeout(r, 1000));

  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/mrps/.gemini/antigravity/brain/7d354a9a-c354-4554-9af1-1ff9d31a9cfa/test_cdp_zoomed_in.png', Buffer.from(shot2.data, 'base64'));

  // Test zoom out
  console.log('Zooming out...');
  await send('Runtime.evaluate', {
    expression: `window.__map.setZoom(8.5);`
  });
  await new Promise(r => setTimeout(r, 1000));

  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/mrps/.gemini/antigravity/brain/7d354a9a-c354-4554-9af1-1ff9d31a9cfa/test_cdp_zoomed_out.png', Buffer.from(shot3.data, 'base64'));

  // Reset zoom back
  await send('Runtime.evaluate', {
    expression: `window.__map.setZoom(10.5);`
  });

  ws.close();
}

main().catch(console.error);
