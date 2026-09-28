import type { BatteryState } from "./battery-state";
import { serializeControllerState } from "./script-state";
import type { XenonRequestKind } from "./xenon-reconciliation";

export type XenonBackendResult = {
    ok: boolean;
    error?: string;
    published?: boolean;
};

export function normalizeXenonBackendResult(result: unknown): XenonBackendResult {
    if (!result || typeof result !== "object") {
        return { ok: false, error: "invalid_backend_response" };
    }

    const value = result as Record<string, unknown>;
    if (typeof value.ok !== "boolean") {
        return { ok: false, error: "invalid_backend_response" };
    }

    return {
        ok: value.ok,
        error: typeof value.error === "string" ? value.error : undefined,
        published: typeof value.published === "boolean" ? value.published : undefined,
    };
}

export async function syncXenon(kind: XenonRequestKind, state: BatteryState): Promise<XenonBackendResult> {
    const value = serializeControllerState(state);
    const result = kind === "ensure"
        ? await backend.ensure_state(value)
        : await backend.publish_state(value);
    return normalizeXenonBackendResult(result);
}