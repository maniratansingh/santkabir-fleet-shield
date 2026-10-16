import cp from 'child_process';
import fs from 'fs';

const chromeProc = cp.spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless",
  "--remote-debugging-port=9225",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  "--use-angle=swiftshader"
]);

await new Promise(r => setTimeout(r, 3500));

try {
  const newTabRes = await fetch("http://127.0.0.1:9225/json/new?http://localhost:4173", { method: "PUT" });
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
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false
  });

  console.log("Waiting for map and telemetry rendering...");
  await new Promise(r => setTimeout(r, 5000));

  // 1. Dark Mode
  await send("Runtime.evaluate", {
    expression: `(() => {
      // Toggle theme button in Dynamic Island or root class
      document.documentElement.classList.add('dark');
      localStorage.setItem('sk_theme', 'dark');
      const btn = document.querySelector('button[title*="theme" i], button[aria-label*="theme" i]') || 
                  Array.from(document.querySelectorAll('button')).find(b => b.innerHTML.includes('lucide-moon') || b.innerHTML.includes('lucide-sun'));
      if (btn) btn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 3000));

  const darkShot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/Users/mrps/.gemini/antigravity/brain/1c7bf086-5c5f-4cc6-8b73-10a237024d7a/road_navigation_dark.png", Buffer.from(darkShot.data, "base64"));
  console.log("Saved road_navigation_dark.png");

  // 2. Satellite Mode
  await send("Runtime.evaluate", {
    expression: `(() => {
      const satBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Satellite') || (b.title && b.title.includes('Satellite')));
      if (satBtn) satBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 3500));

  const satShot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/Users/mrps/.gemini/antigravity/brain/1c7bf086-5c5f-4cc6-8b73-10a237024d7a/road_navigation_satellite.png", Buffer.from(satShot.data, "base64"));
  console.log("Saved road_navigation_satellite.png");

  ws.close();
} catch (err) {
  console.error("Screenshot capture error:", err);
} finally {
  chromeProc.kill();
  process.exit(0);
}
