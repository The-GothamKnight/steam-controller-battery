import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const backendPath = new URL("../backend/main.lua", import.meta.url);
const titleBarControlsFind = /const \w+=\w+\.memo\(function\(\w+\)\{const\{className:\w+,\.\.\.\w+\}=\w+;return\(0,\w+\.jsx\)\("div",\{className:\(0,\w+\.A\)\(\w+\(\)\.TitleBarControls,\w+\),\.\.\.\w+,children:\(0,\w+\.jsxs\)\(\w+\.wC,\{children:\[.*?\]\}\)\}\)\}\)/s;
const firstNativeChild = /(\(0,(\w+)\.jsx\)\(fr,\{\}\))/;
const ffiChild = "(0,$2.jsx)(window.PLUGIN_LIST['steam-controller-battery']?.SteamBatteryIndicator||(()=>null),{})";

function findSteamUiBundle(): string | undefined {
    const programFiles = process.env["ProgramFiles(x86)"];
    const steamUiDirectory = process.env.STEAMUI_DIRECTORY
        ?? (programFiles ? join(programFiles, "Steam", "steamui") : undefined);
    if (!existsSync(steamUiDirectory)) return undefined;

    return readdirSync(steamUiDirectory)
        .filter((file) => /^chunk~[0-9a-f]+\.js$/.test(file))
        .map((file) => join(steamUiDirectory, file))
        .find((path) => titleBarControlsFind.test(readFileSync(path, "utf8")));
}

const bundlePath = findSteamUiBundle();
const installedSteamTest = bundlePath ? test : test.skip;

describe("TitleBarControls Starlight patch", () => {
    installedSteamTest("matches the installed header icon bar once and preserves its native children", () => {
        const bundle = readFileSync(bundlePath!, "utf8");
        const matches = [...bundle.matchAll(new RegExp(titleBarControlsFind.source, "gs"))];
        expect(matches).toHaveLength(1);

        const original = matches[0][0];
        const transformed = original.replace(firstNativeChild, `${ffiChild},$1`);
        expect(transformed).not.toBe(original);
        expect((transformed.match(/SteamBatteryIndicator/g) ?? [])).toHaveLength(1);

        expect(transformed).toContain("children:[(0,i.jsx)(window.PLUGIN_LIST['steam-controller-battery']?.SteamBatteryIndicator||(()=>null),{})");

        const nativeChildren = ["fr", "Br", "br", "yr", "pr", "_r", "hr", "Cr", "sr", "dr", "tr", "ur", "mr"];
        let cursor = -1;
        for (const child of nativeChildren) {
            const next = transformed.indexOf(`(0,i.jsx)(${child},{})`, cursor + 1);
            expect(next).toBeGreaterThan(cursor);
            cursor = next;
        }
        expect(transformed).toContain("(0,i.jsx)(window.PLUGIN_LIST['steam-controller-battery']?.SteamBatteryIndicator||(()=>null),{}),(0,i.jsx)(fr,{})");
        expect(original).toContain("(0,i.jsx)(sr,{})");
    });

    test("contains no Announcements-specific dependency in the plugin patch", () => {
        const backend = readFileSync(backendPath, "utf8");
        expect(backend).toContain("TitleBarControls");
        expect(backend).not.toContain("steam://url/SteamAnnouncements");
        expect(backend).not.toContain("AnnouncementsButton");
        expect(backend).not.toContain("function sr");
    });
});
