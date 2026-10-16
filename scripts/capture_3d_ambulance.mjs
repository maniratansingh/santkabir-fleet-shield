import cp from 'child_process';
import fs from 'fs';

const chromeProc = cp.spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless",
  "--remote-debugging-port=9223",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  "--use-angle=swiftshader"
]);

await new Promise(r => setTimeout(r, 3500));

try {
  const newTabRes = await fetch("http://127.0.0.1:9223/json/new?http://localhost:8788", { method: "PUT" });
  const tab = await newTabRes.json();

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const msgId = id++;
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === msgId) {
        ws.removeEventListener("message", handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false
  });

  // Wait for map and markers to render
  await new Promise(r => setTimeout(r, 4500));

  // Focus on one ambulance for close-up inspection
  await send("Runtime.evaluate", {
    expression: `
      if (window.__map) {
        window.__map.flyTo({ center: [82.6841, 26.7912], zoom: 14.5, pitch: 35, duration: 0 });
      }
    `
  });

  await new Promise(r => setTimeout(r, 2500));

  const screenshot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/Users/mrps/.gemini/antigravity/brain/1c7bf086-5c5f-4cc6-8b73-10a237024d7a/big_3d_ambulance_verified.png", Buffer.from(screenshot.data, "base64"));
  console.log("Screenshot saved: big_3d_ambulance_verified.png");

  // Overview screenshot
  await send("Runtime.evaluate", {
    expression: `
      if (window.__map) {
        window.__map.flyTo({ center: [82.718401, 26.797313], zoom: 11.5, pitch: 20, duration: 0 });
      }
    `
  });
  await new Promise(r => setTimeout(r, 2000));
  const overview = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/Users/mrps/.gemini/antigravity/brain/1c7bf086-5c5f-4cc6-8b73-10a237024d7a/fleet_overview_verified.png", Buffer.from(overview.data, "base64"));
  console.log("Screenshot saved: fleet_overview_verified.png");

  ws.close();
} catch (e) {
  console.error("Capture error:", e);
} finally {
  chromeProc.kill();
}
process.exit(0);
