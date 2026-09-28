import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const backendPath = new URL("../backend/main.lua", import.meta.url);
const fixturesPath = new URL("./fixtures/", import.meta.url);
const titleBarControlsFind = /const \w+=\w+\.memo\(function\(\w+\)\{const\{className:\w+,\.\.\.\w+\}=\w+;return\(0,\w+\.jsx\)\("div",\{className:\(0,\w+\.A\)\(\w+\(\)\.TitleBarControls,\w+\),\.\.\.\w+,children:\(0,\w+\.jsxs\)\(\w+\.wC,\{children:\[.*?\]\}\)\}\)\}\)/s;
const contextualFirstNativeChild = /children:\[(\(0,(\w+)\.jsx\)\(\w+,\{\}\))/;
const nativeChild = /\(0,\w+\.jsx\)\((\w+),\{\}\)/g;
const ffiChild = "(0,$2.jsx)(window.PLUGIN_LIST['steam-controller-battery']?.SteamBatteryIndicator||(()=>null),{})";

function ffiChildFor(module: string): string {
    return `(0,${module}.jsx)(window.PLUGIN_LIST['steam-controller-battery']?.SteamBatteryIndicator||(()=>null),{})`;
}

type Fixture = {
    name: string;
    file: string;
    jsxModule: string;
    nativeChildren: string[];
};

const fixtures: Fixture[] = [
    {
        name: "Stable",
        file: "title-bar-controls-stable.js",
        jsxModule: "i",
        nativeChildren: ["fr", "Br", "br", "yr", "pr", "_r", "hr", "Cr", "sr", "dr", "tr", "ur", "mr"],
    },
    {
        name: "Beta",
        file: "title-bar-controls-beta.js",
        jsxModule: "e",
        nativeChildren: ["Gt", "ci", "kt", "xr", "Er", "Ei", "ki", "rn", "Ii", "Ui", "Ni", "ne", "Ct"],
    },
];

function readFixture(file: string): string {
    return readFileSync(new URL(file, fixturesPath), "utf8");
}

function countContextualFirstChildren(source: string): number {
    return [...source.matchAll(new RegExp(contextualFirstNativeChild.source, "g"))].length;
}

function nativeChildren(source: string): string[] {
    return [...source.matchAll(nativeChild)].map((match) => match[1]);
}

function transform(scope: string): string {
    return scope.replace(contextualFirstNativeChild, `children:[${ffiChild},$1`);
}

function transformBundle(source: string): string {
    return source.replace(titleBarControlsFind, transform);
}

function expectSyntacticallyValidJavaScript(source: string): void {
    expect(() => new Function(source)).not.toThrow();
}

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
    for (const fixture of fixtures) {
        test(`transforms the ${fixture.name} TitleBarControls fixture once and preserves native children`, () => {
            const fixtureSource = readFixture(fixture.file);
            const matches = [...fixtureSource.matchAll(new RegExp(titleBarControlsFind.source, "gs"))];
            expect(matches).toHaveLength(1);

            const original = matches[0][0];
            expect(countContextualFirstChildren(original)).toBe(1);
            expect(nativeChildren(original)).toEqual(fixture.nativeChildren);

            const transformed = transform(original);
            expect(transformed).not.toBe(original);
            expect((transformed.match(/SteamBatteryIndicator/g) ?? [])).toHaveLength(1);
            expect(transformed).toContain(`children:[${ffiChildFor(fixture.jsxModule)},(0,${fixture.jsxModule}.jsx)(${fixture.nativeChildren[0]},{})`);
            expect(nativeChildren(transformed)).toEqual(fixture.nativeChildren);
            expectSyntacticallyValidJavaScript(transformed);
        });
    }

    test("remains valid when the first minified child identifier changes", () => {
        const arbitraryIdentifier = "zz";
        const source = readFixture("title-bar-controls-stable.js").replace("(fr,{})", `(${arbitraryIdentifier},{})`);
        const scope = [...source.matchAll(new RegExp(titleBarControlsFind.source, "gs"))][0][0];
        const transformed = transform(scope);

        expect(countContextualFirstChildren(scope)).toBe(1);
        expect(transformed).toContain(`${ffiChildFor("i")},(0,i.jsx)(${arbitraryIdentifier},{})`);
        expectSyntacticallyValidJavaScript(transformed);
    });

    test("does not transform an unrelated structure", () => {
        const unrelated = readFixture("title-bar-controls-unrelated.js");
        expect([...unrelated.matchAll(new RegExp(titleBarControlsFind.source, "gs"))]).toHaveLength(0);
        expect(transformBundle(unrelated)).toBe(unrelated);
        expectSyntacticallyValidJavaScript(unrelated);
    });

    installedSteamTest("matches the installed header icon bar once and prepends one indicator", () => {
        const bundle = readFileSync(bundlePath!, "utf8");
        const matches = [...bundle.matchAll(new RegExp(titleBarControlsFind.source, "gs"))];
        expect(matches).toHaveLength(1);

        const original = matches[0][0];
        const originalChildren = nativeChildren(original);
        expect(countContextualFirstChildren(original)).toBe(1);
        expect(originalChildren).toHaveLength(13);

        const transformed = transform(original);
        expect((transformed.match(/SteamBatteryIndicator/g) ?? [])).toHaveLength(1);
        expect(transformed).toMatch(/children:\[\(0,\w+\.jsx\)\(window\.PLUGIN_LIST\['steam-controller-battery'\]\?\.SteamBatteryIndicator\|\|\(\(\)=>null\),\{\}\),\(0,\w+\.jsx\)\(\w+,\{\}\)/);
        expect(nativeChildren(transformed)).toEqual(originalChildren);
        expectSyntacticallyValidJavaScript(transformed);
    });

    test("contains no minified child or Announcements-specific dependency in the plugin patch", () => {
        const backend = readFileSync(backendPath, "utf8");
        expect(backend).toContain("TitleBarControls");
        expect(backend).toContain("children:\\[(\\(0,(\\w+)\\.jsx\\)\\(\\w+,\\{\\}\\))");
        expect(backend).not.toContain("(fr,");
        expect(backend).not.toContain("(Gt,");
        expect(backend).not.toContain("steam://url/SteamAnnouncements");
        expect(backend).not.toContain("AnnouncementsButton");
        expect(backend).not.toContain("function sr");
    });
});
