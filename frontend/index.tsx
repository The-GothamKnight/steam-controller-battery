import { definePlugin } from "millennium";
import { disconnectedState, readBatteryState } from "./battery-state";
import { SteamBatteryIndicator as SteamBatteryIndicatorView } from "./steam-battery-indicator";
import { updateSteamBatteryIndicator } from "./steam-battery-indicator-state";
import { syncXenon } from "./xenon-backend";
import { XenonReconciler } from "./xenon-reconciliation";

const CONTROLLER_POLL_INTERVAL_MS = 2_000;

/** @ffi */
export function SteamBatteryIndicator(): object {
    return <SteamBatteryIndicatorView />;
}

export default definePlugin(() => {
    const reconciler = new XenonReconciler(
        syncXenon,
        window,
        (change, error) => {
            if (change === "unavailable") {
                console.info(
                    "[Steam Controller Battery] Xenon is unavailable; Steam battery monitoring continues.",
                    error ?? "",
                );
            } else {
                console.info("[Steam Controller Battery] Xenon state synchronization restored.");
            }
        },
    );

    const sampleControllerState = () => {
        const state = readBatteryState();
        updateSteamBatteryIndicator(state ?? disconnectedState());
        if (!state) return;
        reconciler.observe(state);
    };

    // First pass after ControllerStore has had a short moment to initialize.
    const initialSampleTimer = window.setTimeout(sampleControllerState, 1_000);
    const controllerPollTimer = window.setInterval(sampleControllerState, CONTROLLER_POLL_INTERVAL_MS);
    let shuttingDown = false;

    const stopPublicationActivity = () => {
        window.clearTimeout(initialSampleTimer);
        window.clearInterval(controllerPollTimer);
        reconciler.dispose();
    };

    // ShutdownStart is Steam's native lifecycle event, unlike a WebHelper
    // reload. Do not await work here: Steam's exit must continue even if
    // Millennium or Xenon is unavailable.
    const shutdownSubscription = SteamClient.User.RegisterForShutdownStart(() => {
        if (shuttingDown) return;
        shuttingDown = true;
        stopPublicationActivity();
        updateSteamBatteryIndicator(disconnectedState());

        void syncXenon("publish", disconnectedState()).catch(() => {});
    });

    console.log("[Steam Controller Battery] initialized (ControllerStore -> Xenon scriptStates, Steam UI)");

    return {
        icon: <span />,
        onDismount: () => {
            shutdownSubscription.unregister();
            stopPublicationActivity();
            updateSteamBatteryIndicator(disconnectedState());
        },
    };
});
