import cp from 'child_process';
import fs from 'fs';

const chromeProc = cp.spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless",
  "--remote-debugging-port=9222",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  "--use-angle=swiftshader"
]);

await new Promise(r => setTimeout(r, 3500));

try {
  const newTabRes = await fetch("http://127.0.0.1:9222/json/new?http://localhost:3000", { method: "PUT" });
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

  console.log("Waiting 4s for initial map load...");
  await new Promise(r => setTimeout(r, 4000));

  // 1. Layout 1: Light Gray (Verified exact hospital location)
  const lightShot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/layout_1_light_exact_hospital.png", Buffer.from(lightShot.data, "base64"));
  console.log("Saved /tmp/layout_1_light_exact_hospital.png");

  // Helper to switch map style from FloatingControls
  const switchStyle = async (styleName) => {
    await send("Runtime.evaluate", {
      expression: `(() => {
        // Find style dropdown button in FloatingControls (layers icon)
        const buttons = Array.from(document.querySelectorAll("button"));
        const layerBtn = buttons.find(b => b.title && b.title.includes("Map Style")) || 
                         buttons.find(b => b.innerHTML.includes("lucide-layers") || b.innerHTML.includes("Layers"));
        if (layerBtn) layerBtn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 500));
    await send("Runtime.evaluate", {
      expression: `(() => {
        const optionBtns = Array.from(document.querySelectorAll("button"));
        const target = optionBtns.find(b => b.textContent && b.textContent.includes("${styleName}"));
        if (target) target.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 3500));
  };

  // 2. Layout 2: Satellite Imagery
  console.log("Switching to Satellite layout...");
  await switchStyle("Satellite");
  const satShot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/layout_2_satellite.png", Buffer.from(satShot.data, "base64"));
  console.log("Saved /tmp/layout_2_satellite.png");

  // 3. Layout 3: OpenStreetMap (Streets)
  console.log("Switching to OpenStreetMap layout...");
  await switchStyle("OpenStreetMap");
  const streetsShot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/layout_3_streets.png", Buffer.from(streetsShot.data, "base64"));
  console.log("Saved /tmp/layout_3_streets.png");

  // 4. Layout 4: Dark Gray
  console.log("Switching to Dark Gray layout...");
  await switchStyle("Dark Gray");
  const darkShot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/layout_4_dark.png", Buffer.from(darkShot.data, "base64"));
  console.log("Saved /tmp/layout_4_dark.png");

} catch (err) {
  console.error("Layout verification error:", err);
} finally {
  chromeProc.kill();
  process.exit(0);
}
