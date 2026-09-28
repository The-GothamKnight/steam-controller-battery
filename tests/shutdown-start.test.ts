import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const frontend = readFileSync(new URL("../frontend/index.tsx", import.meta.url), "utf8");
const backend = readFileSync(new URL("../backend/main.lua", import.meta.url), "utf8");

const shutdownCallback = /RegisterForShutdownStart\(\(\) => \{([\s\S]*?)\n    \}\);/.exec(frontend)?.[1] ?? "";
const onDismount = /onDismount: \(\) => \{([\s\S]*?)\n        \},/.exec(frontend)?.[1] ?? "";

test("ShutdownStart publishes one final canonical state after stopping normal activity", () => {
    expect(frontend).toContain("SteamClient.User.RegisterForShutdownStart");
    expect(shutdownCallback).toContain("if (shuttingDown) return;");
    expect(shutdownCallback).toContain("shuttingDown = true;");
    expect(shutdownCallback.indexOf("stopPublicationActivity();")).toBeLessThan(
        shutdownCallback.indexOf('syncXenon("publish", disconnectedState())'),
    );
    expect(shutdownCallback.match(/syncXenon\("publish", disconnectedState\(\)\)/g)).toHaveLength(1);
    expect(shutdownCallback).toContain("updateSteamBatteryIndicator(disconnectedState());");
});

test("ordinary frontend dismount only unregisters ShutdownStart", () => {
    expect(onDismount).toContain("shutdownSubscription.unregister();");
    expect(onDismount).not.toContain("syncXenon(");
    expect(onDismount).not.toContain("backend.publish_state");
});

test("backend keeps a best-effort on_unload state without diagnostics", () => {
    const unload = /local function on_unload\(\)([\s\S]*?)\nend/.exec(backend)?.[1] ?? "";
    expect(unload).toContain("post_state(DISCONNECTED_STATE)");
    expect(unload.match(/post_state\(/g)).toHaveLength(1);
    expect(backend).not.toContain("shutdown_diagnostic");
});
