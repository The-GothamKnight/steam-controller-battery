import type { BatteryState } from "./battery-state";

export const SCRIPT_STATE_NAME = "steam-controller-state";
export const SCRIPT_STATE_MAX_LENGTH = 200;

export function controllerStateSignature(
    state: Pick<BatteryState, "connected" | "battery" | "charging" | "wireless" | "syncing">,
): string {
    return JSON.stringify({
        connected: state.connected,
        battery: state.battery,
        charging: state.charging,
        wireless: state.wireless,
        syncing: state.syncing,
    });
}

export function serializeControllerState(
    state: Pick<BatteryState, "connected" | "battery" | "charging" | "wireless" | "syncing">,
): string {
    const value = JSON.stringify({
        connected: state.connected,
        battery: state.battery,
        charging: state.charging,
        wireless: state.wireless,
        syncing: state.syncing,
    });
    if (value.length > SCRIPT_STATE_MAX_LENGTH) {
        throw new RangeError("Controller state exceeds Xenon's 200-character limit");
    }
    return value;
}
