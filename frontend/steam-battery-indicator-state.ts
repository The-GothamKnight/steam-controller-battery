import type { BatteryState } from "./battery-state";

export const STEAM_BATTERY_INDICATOR_ID = "steam-controller-battery-indicator";

export type IndicatorPresentation = {
    batteryWidth: string;
    charging: boolean;
    connected: boolean;
    label: string;
    syncing: boolean;
    title: string;
    wireless: boolean;
};

export function indicatorPresentation(state: BatteryState): IndicatorPresentation {
    const batteryLabel = state.battery == null ? "—" : `${state.battery}%`;
    const details = [
        `Steam Controller battery: ${batteryLabel}`,
        state.charging ? "charging" : undefined,
        state.wireless ? "wireless" : undefined,
        state.syncing ? "synchronizing" : undefined,
    ].filter(Boolean).join(", ");

    return {
        batteryWidth: String(state.battery == null ? 0 : (20 * state.battery) / 100),
        charging: state.charging,
        connected: state.connected,
        label: batteryLabel,
        syncing: state.syncing,
        title: state.connected ? details : "Steam Controller disconnected",
        wireless: state.wireless,
    };
}

let currentState: BatteryState = {
    connected: false,
    battery: null,
    charging: false,
    wireless: false,
    syncing: false,
    name: "Steam Controller",
    serial: null,
    controllerIndex: null,
};
const listeners = new Set<() => void>();

function stateSignature(state: BatteryState): string {
    return [state.connected, state.battery, state.charging, state.wireless, state.syncing].join("|");
}

export function getSteamBatteryIndicatorState(): BatteryState {
    return currentState;
}

export function subscribeSteamBatteryIndicator(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Notify mounted indicator instances when the visible state changes. */
export function updateSteamBatteryIndicator(state: BatteryState): void {
    if (stateSignature(currentState) === stateSignature(state)) return;
    currentState = state;
    listeners.forEach((listener) => listener());
}
