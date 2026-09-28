export type ControllerLike = {
    nControllerIndex?: number;
    strName?: string;
    strSerialNumber?: string;
    unVendorID?: number;
    unProductID?: number;
    ucBatteryLevel?: number;
    bCharging?: boolean;
    bWireless?: boolean;
};

type ControllerStoreLike = {
    GetControllers?: () => Iterable<ControllerLike> | ControllerLike[];
};

type ControllerLookup = {
    available: boolean;
    controller?: ControllerLike;
};

declare global {
    const ControllerStore: ControllerStoreLike | undefined;
}

export type BatteryState = {
    connected: boolean;
    battery: number | null;
    charging: boolean;
    wireless: boolean;
    syncing: boolean;
    name: string;
    serial: string | null;
    controllerIndex: number | null;
};

const STEAM_VID = 0x28de;
const STEAM_CONTROLLER_PIDS = new Set([0x1302, 0x1304]);
const TRANSIENT_100_GRACE_MS = 5000;

let lastTrustedBattery: number | null = null;
let lastRawConnected = false;
let lastRawCharging = false;
let transient100Since = 0;

function disconnectedState(): BatteryState {
    return {
        connected: false,
        battery: null,
        charging: false,
        wireless: false,
        syncing: false,
        name: "Steam Controller",
        serial: null,
        controllerIndex: null,
    };
}

function getSteamController(): ControllerLookup {
    try {
        if (
            typeof ControllerStore === "undefined" ||
            typeof ControllerStore.GetControllers !== "function"
        ) {
            return { available: false };
        }

        const list = Array.from(ControllerStore.GetControllers() ?? []);
        const controller = (
            list.find(
                (controller) =>
                    controller.unVendorID === STEAM_VID &&
                    typeof controller.unProductID === "number" &&
                    STEAM_CONTROLLER_PIDS.has(controller.unProductID),
            ) ??
            list.find((controller) =>
                /steam controller/i.test(String(controller.strName ?? "")),
            )
        );
        return { available: true, controller };
    } catch {
        return { available: false };
    }
}

export function normalizeBatteryLevel(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * The single ControllerStore reader. Consumers (Xenon publisher and Steam UI)
 * receive this normalized state and deliberately do not depend on each other.
 */
export function readBatteryState(): BatteryState | null {
    const lookup = getSteamController();
    if (!lookup.available) return null;
    const controller = lookup.controller;
    const now = Date.now();

    if (!controller) {
        lastRawConnected = false;
        transient100Since = 0;
        return disconnectedState();
    }

    const rawBattery = normalizeBatteryLevel(controller.ucBatteryLevel);
    const charging = controller.bCharging === true;
    const stateTransition = !lastRawConnected || charging !== lastRawCharging;

    lastRawConnected = true;
    lastRawCharging = charging;

    let battery = rawBattery;
    let syncing = false;

    if (rawBattery === 100 && lastTrustedBattery !== 100) {
        if (lastTrustedBattery == null) {
            if (transient100Since === 0) transient100Since = now;
            if (now - transient100Since < TRANSIENT_100_GRACE_MS) {
                battery = null;
                syncing = true;
            } else {
                lastTrustedBattery = 100;
                transient100Since = 0;
            }
        } else {
            if (stateTransition || transient100Since === 0) transient100Since = now;
            if (now - transient100Since < TRANSIENT_100_GRACE_MS) {
                battery = lastTrustedBattery;
                syncing = true;
            } else {
                lastTrustedBattery = 100;
                transient100Since = 0;
            }
        }
    } else if (rawBattery != null) {
        transient100Since = 0;
        lastTrustedBattery = rawBattery;
    }

    return {
        connected: true,
        battery,
        charging,
        wireless: controller.bWireless === true,
        syncing,
        name: String(controller.strName ?? "Steam Controller"),
        serial:
            typeof controller.strSerialNumber === "string"
                ? controller.strSerialNumber
                : null,
        controllerIndex:
            typeof controller.nControllerIndex === "number"
                ? controller.nControllerIndex
                : null,
    };
}

export { disconnectedState };
