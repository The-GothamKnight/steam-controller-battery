import { describe, expect, test } from "bun:test";
import { disconnectedState, normalizeBatteryLevel, readBatteryState } from "../frontend/battery-state";
import { controllerStateSignature, SCRIPT_STATE_MAX_LENGTH, SCRIPT_STATE_NAME, serializeControllerState } from "../frontend/script-state";

describe("scriptStates controller protocol", () => {
    test("normalizes battery readings to rounded percentages", () => {
        expect(normalizeBatteryLevel(72.4)).toBe(72);
        expect(normalizeBatteryLevel(72.6)).toBe(73);
        expect(normalizeBatteryLevel(-1)).toBe(0);
        expect(normalizeBatteryLevel(101)).toBe(100);
        expect(normalizeBatteryLevel(Number.NaN)).toBeNull();
    });

    test("does not report an unavailable ControllerStore as disconnected", () => {
        const target = globalThis as typeof globalThis & { ControllerStore?: unknown };
        const previous = target.ControllerStore;
        try {
            delete target.ControllerStore;
            expect(readBatteryState()).toBeNull();
            target.ControllerStore = { GetControllers: () => [] };
            expect(readBatteryState()?.connected).toBe(false);
        } finally {
            if (previous === undefined) delete target.ControllerStore;
            else target.ControllerStore = previous;
        }
    });

    test("serializes a compact state without a polling timestamp", () => {
        const connected = JSON.parse(serializeControllerState({
            connected: true,
            battery: 72,
            charging: false,
            wireless: true,
            syncing: false,
        }));
        expect(connected).toEqual({
            connected: true,
            battery: 72,
            charging: false,
            wireless: true,
            syncing: false,
        });

        const disconnected = JSON.parse(serializeControllerState(disconnectedState()));
        expect(disconnected).toMatchObject({ connected: false, battery: null });

        const value = serializeControllerState({
            connected: true,
            battery: null,
            charging: false,
            wireless: false,
            syncing: true,
        });
        expect(SCRIPT_STATE_NAME).toBe("steam-controller-state");
        expect(value.length).toBeLessThan(SCRIPT_STATE_MAX_LENGTH);
    });

    test("normalized signatures ignore sample timestamps", () => {
        const state = { connected: true, battery: 65, charging: false, wireless: true, syncing: false };
        expect(controllerStateSignature(state)).toBe(controllerStateSignature({ ...state, updatedAt: 1 }));
        expect(controllerStateSignature(state)).not.toBe(controllerStateSignature({ ...state, battery: 64 }));
    });
});
