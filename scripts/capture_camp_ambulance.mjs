import cp from 'child_process';
import fs from 'fs';

const chromeProc = cp.spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless",
  "--remote-debugging-port=9222",
  "--enable-unsafe-swiftshader",
  "--use-gl=angle",
  "--use-angle=swiftshader"
]);

await new Promise(r => setTimeout(r, 2000));

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

  console.log("Waiting 4.5s for map tiles and 3D vehicles to render...");
  await new Promise(r => setTimeout(r, 4500));

  const overviewScreenshot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/clean_road_distance_overview.png", Buffer.from(overviewScreenshot.data, "base64"));
  console.log("Saved /tmp/clean_road_distance_overview.png");

  // 1. Select Mobile Clinic Ambulance 1
  await send("Runtime.evaluate", {
    expression: `(() => {
      const cards = document.querySelectorAll(".cursor-pointer");
      for (const card of cards) {
        if (card.textContent && card.textContent.includes("Mobile Clinic")) {
          card.click();
          break;
        }
      }
    })()`
  });

  await new Promise(r => setTimeout(r, 2500));

  const selectedScreenshot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/clean_vehicle_selected.png", Buffer.from(selectedScreenshot.data, "base64"));
  console.log("Saved /tmp/clean_vehicle_selected.png");

  // 2. Click on a Camp marker or trigger camp selection to capture clean camp modal
  await send("Runtime.evaluate", {
    expression: `(() => {
      const campPills = document.querySelectorAll(".group.select-none");
      for (const p of campPills) {
        if (p.textContent && p.textContent.includes("Harraiya")) {
          p.click();
          break;
        }
      }
    })()`
  });

  await new Promise(r => setTimeout(r, 2000));

  const campModalScreenshot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/clean_camp_modal.png", Buffer.from(campModalScreenshot.data, "base64"));
  console.log("Saved /tmp/clean_camp_modal.png");

} catch (err) {
  console.error("Capture error:", err);
} finally {
  chromeProc.kill();
  process.exit(0);
}
