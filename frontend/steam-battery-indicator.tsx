import { useSyncExternalStore, type ReactElement } from "react";
import {
    getSteamBatteryIndicatorState,
    indicatorPresentation,
    STEAM_BATTERY_INDICATOR_ID,
    subscribeSteamBatteryIndicator,
} from "./steam-battery-indicator-state";

function batteryColor(level: number | null): string {
    if (level == null) return "#8f98a0";
    if (level <= 20) return "#e74c3c";
    if (level <= 50) return "#f39c12";
    return "#a4d007";
}

/**
 * Rendered by Steam's own React tree through the Starlight Hooking API.
 * Returning null for a disconnected controller removes the indicator with its
 * React host; no document ownership or mount retry is needed.
 */
export function SteamBatteryIndicator(): ReactElement | null {
    const state = useSyncExternalStore(
        subscribeSteamBatteryIndicator,
        getSteamBatteryIndicatorState,
        getSteamBatteryIndicatorState,
    );
    const view = indicatorPresentation(state);
    if (!view.connected) return null;

    return (
        <div
            id={STEAM_BATTERY_INDICATOR_ID}
            aria-label={view.title}
            data-syncing={view.syncing ? "true" : undefined}
            data-wireless={view.wireless ? "true" : undefined}
            role="img"
            style={{ alignItems: "center", boxSizing: "border-box", color: "#d6d7d8", display: "flex", flex: "0 0 auto", fontFamily: "inherit", fontSize: "12px", gap: "4px", height: "24px", lineHeight: 1, margin: "0 4px 0 0", opacity: 0.9, padding: "0 5px", whiteSpace: "nowrap" }}
            title={view.title}
        >
            <svg aria-hidden="true" height="17" viewBox="0 0 28 18" width="27">
                <rect fill="none" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" width="22" x="1" y="2" />
                <rect fill={batteryColor(state.battery)} height="10" rx="1" width={view.batteryWidth} x="3" y="4" />
                <path d="M25 6v6h2V6z" fill="currentColor" />
            </svg>
            <span style={{ fontVariantNumeric: "tabular-nums", minWidth: "27px" }}>{view.label}</span>
            {view.charging ? <span style={{ color: "#a4d007", fontSize: "12px", lineHeight: 1 }}>⚡</span> : null}
        </div>
    );
}
