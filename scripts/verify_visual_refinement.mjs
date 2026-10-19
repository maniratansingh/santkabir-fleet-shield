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

  // Reload page to get latest Vite HMR & bundle
  console.log('Reloading page...');
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 2000));

  // Verify map and features
  const state = await send('Runtime.evaluate', {
    expression: `(() => {
      const map = window.__map;
      if (!map) return { err: 'No window.__map' };
      const s = map.getSource('delivery-incoming-routes');
      const ser = s ? s.serialize() : null;
      return {
        zoom: map.getZoom(),
        center: map.getCenter(),
        featuresCount: ser && ser.data ? ser.data.features.length : 0,
        features: ser && ser.data ? ser.data.features.map(f => ({
          id: f.properties.vehicleId,
          coords: f.geometry ? f.geometry.coordinates.length : 0,
          color: f.properties.lineColor
        })) : []
      };
    })()`,
    returnByValue: true
  });

  console.log('Map State after reload:', JSON.stringify(state.result.value, null, 2));

  // 1. Overview screenshot (regional overview with compact AirTag beacons and full route ribbons)
  console.log('Capturing overview...');
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/mrps/.gemini/antigravity/brain/7d354a9a-c354-4554-9af1-1ff9d31a9cfa/refined_lod_overview.png', Buffer.from(shot1.data, 'base64'));

  // 2. Select AMB-08 (Maghar route) and zoom in
  console.log('Selecting AMB-08...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      // Find row for AMB-08 in the list or click marker
      const rows = document.querySelectorAll('div');
      for (const r of rows) {
        if (r.textContent && r.textContent.includes('AMB-08') && r.textContent.includes('Maghar')) {
          r.click();
          return 'Clicked AMB-08 row';
        }
      }
      return 'Not found';
    })()`
  });
  await new Promise(r => setTimeout(r, 1200));

  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/mrps/.gemini/antigravity/brain/7d354a9a-c354-4554-9af1-1ff9d31a9cfa/refined_selected_vehicle.png', Buffer.from(shot2.data, 'base64'));

  // 3. Zoom In to road level (Zoom 13.8) to verify 3D ambulance and zoom-scaled road ribbons
  console.log('Zooming in to 13.8...');
  await send('Runtime.evaluate', {
    expression: `window.__map.flyTo({ center: [83.094, 26.765], zoom: 13.8, duration: 800 });`
  });
  await new Promise(r => setTimeout(r, 1200));

  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/mrps/.gemini/antigravity/brain/7d354a9a-c354-4554-9af1-1ff9d31a9cfa/refined_zoomed_in_street.png', Buffer.from(shot3.data, 'base64'));

  // 4. Test zoom out to Zoom 8.5
  console.log('Zooming out to 8.5...');
  await send('Runtime.evaluate', {
    expression: `window.__map.flyTo({ zoom: 8.5, duration: 800 });`
  });
  await new Promise(r => setTimeout(r, 1200));

  const shot4 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/mrps/.gemini/antigravity/brain/7d354a9a-c354-4554-9af1-1ff9d31a9cfa/refined_zoomed_out_regional.png', Buffer.from(shot4.data, 'base64'));

  // 5. Test Fit All button
  console.log('Testing Fit All...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const scanBtn = document.querySelector('button[title*=\"Fleet Overview\"]');
      if (scanBtn) scanBtn.click();
      return Boolean(scanBtn);
    })()`
  });
  await new Promise(r => setTimeout(r, 1200));

  const shot5 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/Users/mrps/.gemini/antigravity/brain/7d354a9a-c354-4554-9af1-1ff9d31a9cfa/refined_fit_all.png', Buffer.from(shot5.data, 'base64'));

  ws.close();
  console.log('Verification complete!');
}

main().catch(console.error);
