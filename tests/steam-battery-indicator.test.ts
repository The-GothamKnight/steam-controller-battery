import { describe, expect, test } from "bun:test";
import { disconnectedState, type BatteryState } from "../frontend/battery-state";
import {
    getSteamBatteryIndicatorState,
    indicatorPresentation,
    STEAM_BATTERY_INDICATOR_ID,
    subscribeSteamBatteryIndicator,
    updateSteamBatteryIndicator,
} from "../frontend/steam-battery-indicator-state";

const connected = (overrides: Partial<BatteryState> = {}): BatteryState => ({
    ...disconnectedState(),
    connected: true,
    battery: 72,
    wireless: true,
    ...overrides,
});

describe("Steam React battery indicator", () => {
    test("maps controller state to the validated visible presentation", () => {
        expect(indicatorPresentation(connected({ charging: true }))).toMatchObject({
            connected: true,
            label: "72%",
            batteryWidth: "14.4",
            charging: true,
            wireless: true,
        });
        expect(indicatorPresentation(connected({ battery: null, syncing: true }))).toMatchObject({
            label: "—",
            syncing: true,
        });
        expect(indicatorPresentation(disconnectedState()).connected).toBe(false);
        expect(STEAM_BATTERY_INDICATOR_ID).toBe("steam-controller-battery-indicator");
    });

    test("notifies mounted React instances only for meaningful state changes", () => {
        let notifications = 0;
        const unsubscribe = subscribeSteamBatteryIndicator(() => { notifications += 1; });
        try {
            updateSteamBatteryIndicator(connected());
            updateSteamBatteryIndicator(connected());
            updateSteamBatteryIndicator(connected({ battery: 71 }));
            expect(notifications).toBe(2);
            expect(getSteamBatteryIndicatorState().battery).toBe(71);
        } finally {
            unsubscribe();
            updateSteamBatteryIndicator(disconnectedState());
        }
    });

    test("unsubscribing prevents duplicate logical indicator notifications", () => {
        let notifications = 0;
        const unsubscribe = subscribeSteamBatteryIndicator(() => { notifications += 1; });
        unsubscribe();
        updateSteamBatteryIndicator(connected({ battery: 70 }));
        expect(notifications).toBe(0);
        updateSteamBatteryIndicator(disconnectedState());
    });
});
