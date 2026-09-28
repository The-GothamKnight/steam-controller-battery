import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { normalizeXenonBackendResult } from "../frontend/xenon-backend";

const backendPath = new URL("../backend/main.lua", import.meta.url);

describe("Starlight FFI backend response adapter", () => {
    test("keeps a successful conditional reconciliation response", () => {
        expect(normalizeXenonBackendResult({ ok: true, published: false })).toEqual({
            ok: true,
            error: undefined,
            published: false,
        });
    });

    test("keeps an unavailable Xenon response", () => {
        expect(normalizeXenonBackendResult({ ok: false, error: "xenon_offline: refused", published: false })).toEqual({
            ok: false,
            error: "xenon_offline: refused",
            published: false,
        });
    });

    test("rejects malformed FFI values safely", () => {
        expect(normalizeXenonBackendResult("not-a-result")).toEqual({
            ok: false,
            error: "invalid_backend_response",
        });
    });
});

describe("Starlight backend shutdown contract", () => {
    test("publishes the canonical disconnected state through the existing POST path", () => {
        const backend = readFileSync(backendPath, "utf8");

        expect(backend).toContain('local STATE_NAME = "steam-controller-state"');
        expect(backend).toContain('local DISCONNECTED_STATE = [[{"connected":false,"battery":null,"charging":false,"wireless":false,"syncing":false}]]');
        const unload = /local function on_unload\(\)([\s\S]*?)\nend/.exec(backend);
        expect(unload).not.toBeNull();
        expect(unload?.[1]).toContain("post_state(DISCONNECTED_STATE)");
        expect(unload?.[1].match(/post_state\(/g) ?? []).toHaveLength(1);
        expect(unload?.[1]).not.toContain("retry");
        expect(unload?.[1]).not.toContain("ensure_state");
        expect(unload?.[1]).not.toContain("setTimeout");
        expect(backend).toMatch(/return \{[\s\S]*on_unload = on_unload,[\s\S]*\}/);
    });

    test("retains the existing Starlight FFI publication exports", () => {
        const backend = readFileSync(backendPath, "utf8");

        expect(backend).toMatch(/---@ffi\s*---@param value string\s*---@return table\s*function publish_state\(value\)/s);
        expect(backend).toMatch(/---@ffi\s*---@param value string\s*---@return table\s*function ensure_state\(value\)/s);
    });
});
