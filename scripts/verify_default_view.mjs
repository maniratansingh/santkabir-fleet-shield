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

  console.log("Waiting 4s for initial map load and fitBounds...");
  await new Promise(r => setTimeout(r, 4000));

  // 1. Initial Default View
  const defaultOverview = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/default_view_all_vehicles.png", Buffer.from(defaultOverview.data, "base64"));
  console.log("Saved /tmp/default_view_all_vehicles.png");

  // 2. Select first vehicle
  await send("Runtime.evaluate", {
    expression: `(() => {
      const cards = document.querySelectorAll(".cursor-pointer");
      for (const card of cards) {
        if (card.textContent && card.textContent.includes("Harraiya")) {
          card.click();
          break;
        }
      }
    })()`
  });

  await new Promise(r => setTimeout(r, 2000));
  const selectedVehicle = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/default_view_selected_vehicle.png", Buffer.from(selectedVehicle.data, "base64"));
  console.log("Saved /tmp/default_view_selected_vehicle.png");

  // 3. Switch to Dark Mode
  await send("Runtime.evaluate", {
    expression: `(() => {
      // Deselect first
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      // Toggle theme button
      const themeBtn = document.querySelector("button[title*='Dark'], button[title*='Light'], .group\\\\/pill button");
      if (themeBtn) themeBtn.click();
      else {
        const btns = Array.from(document.querySelectorAll("button"));
        const moonBtn = btns.find(b => b.innerHTML.includes("Moon") || b.innerHTML.includes("lucide-moon"));
        if (moonBtn) moonBtn.click();
      }
    })()`
  });

  await new Promise(r => setTimeout(r, 2500));
  const darkView = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/default_view_dark.png", Buffer.from(darkView.data, "base64"));
  console.log("Saved /tmp/default_view_dark.png");

} catch (err) {
  console.error("Capture error:", err);
} finally {
  chromeProc.kill();
  process.exit(0);
}
