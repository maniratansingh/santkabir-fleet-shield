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

  console.log("Waiting 4s for map and assets to settle...");
  await new Promise(r => setTimeout(r, 4000));

  // 1. Overview with Apple Sheet & Developer Plaque
  const overview = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/fleet_shield_overview.png", Buffer.from(overview.data, "base64"));
  console.log("Saved /tmp/fleet_shield_overview.png");

  // 2. Open Fleet Shield Provisioning Modal (Click QR icon in Dynamic Island)
  await send("Runtime.evaluate", {
    expression: `(() => {
      const qrBtn = document.querySelector("button[title*='Fleet Shield Provisioning'], button[title*='QR']");
      if (qrBtn) qrBtn.click();
      else {
        const btns = Array.from(document.querySelectorAll("button"));
        const b = btns.find(btn => btn.innerHTML.includes("lucide-qr-code") || btn.innerHTML.includes("QrCode"));
        if (b) b.click();
      }
    })()`
  });

  await new Promise(r => setTimeout(r, 2000));

  const modalScreenshot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/fleet_shield_provisioning_modal.png", Buffer.from(modalScreenshot.data, "base64"));
  console.log("Saved /tmp/fleet_shield_provisioning_modal.png");

  // 3. Switch to APK tab in modal
  await send("Runtime.evaluate", {
    expression: `(() => {
      const tabs = Array.from(document.querySelectorAll("button"));
      const apkTab = tabs.find(t => t.textContent && t.textContent.includes("Private APK"));
      if (apkTab) apkTab.click();
    })()`
  });

  await new Promise(r => setTimeout(r, 1500));

  const apkTabScreenshot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("/tmp/fleet_shield_apk_tab.png", Buffer.from(apkTabScreenshot.data, "base64"));
  console.log("Saved /tmp/fleet_shield_apk_tab.png");

} catch (err) {
  console.error("Capture error:", err);
} finally {
  chromeProc.kill();
  process.exit(0);
}
