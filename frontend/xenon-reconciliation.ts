import type { BatteryState } from "./battery-state";
import { controllerStateSignature } from "./script-state";

export const HEALTHY_RECONCILE_MS = 30 * 1000;
export const UNAVAILABLE_BACKOFF_MS = [30, 60, 120, 300].map((seconds) => seconds * 1000);

export type XenonRequestKind = "publish" | "ensure";

export type XenonSyncResult = {
    ok: boolean;
    /** True only when the backend actually sent POST /state/set. */
    published?: boolean;
    error?: unknown;
};

type Scheduler = {
    setTimeout: (callback: () => void, delay: number) => number;
    clearTimeout: (timer: number) => void;
};

type AvailabilityChange = "unavailable" | "restored";

type Request = (kind: XenonRequestKind, state: BatteryState) => Promise<XenonSyncResult>;

/**
 * Keeps Xenon optional while making its in-memory script state recoverable.
 * Controller changes always publish immediately. Timed work is an `ensure`
 * (GET /state/get, followed by a POST only when needed), never a heartbeat POST.
 */
export class XenonReconciler {
    private latestState: BatteryState | null = null;
    private lastObservedSignature = "";
    private unavailable = false;
    private backoffIndex = 0;
    private timer: number | null = null;
    private inFlight = false;
    private pendingPublish = false;
    private active = true;

    constructor(
        private readonly request: Request,
        private readonly scheduler: Scheduler,
        private readonly onAvailabilityChange: (change: AvailabilityChange, error?: unknown) => void,
    ) {}

    observe(state: BatteryState): void {
        if (!this.active) return;
        this.latestState = state;
        const signature = controllerStateSignature(state);
        if (signature === this.lastObservedSignature) return;
        this.lastObservedSignature = signature;
        this.cancelTimer();
        this.queue("publish");
    }

    dispose(): void {
        this.active = false;
        this.cancelTimer();
        this.latestState = null;
        this.pendingPublish = false;
    }

    private queue(kind: XenonRequestKind): void {
        if (!this.active || !this.latestState) return;
        if (this.inFlight) {
            this.pendingPublish ||= kind === "publish";
            return;
        }
        void this.run(kind, this.latestState);
    }

    private async run(kind: XenonRequestKind, state: BatteryState): Promise<void> {
        this.inFlight = true;
        let result: XenonSyncResult;
        try {
            result = await this.request(kind, state);
        } catch (error) {
            result = { ok: false, error };
        } finally {
            this.inFlight = false;
        }

        if (!this.active) return;
        if (result.ok) this.handleSuccess();
        else this.handleFailure(result.error);

        if (this.pendingPublish) {
            this.pendingPublish = false;
            this.queue("publish");
        }
    }

    private handleSuccess(): void {
        const wasUnavailable = this.unavailable;
        this.unavailable = false;
        this.backoffIndex = 0;
        if (wasUnavailable) this.onAvailabilityChange("restored");
        this.schedule(HEALTHY_RECONCILE_MS, "ensure");
    }

    private handleFailure(error: unknown): void {
        const firstFailure = !this.unavailable;
        this.unavailable = true;
        if (firstFailure) this.onAvailabilityChange("unavailable", error);
        const delay = UNAVAILABLE_BACKOFF_MS[this.backoffIndex];
        this.backoffIndex = Math.min(this.backoffIndex + 1, UNAVAILABLE_BACKOFF_MS.length - 1);
        this.schedule(delay, "ensure");
    }

    private schedule(delay: number, kind: XenonRequestKind): void {
        this.cancelTimer();
        this.timer = this.scheduler.setTimeout(() => {
            this.timer = null;
            this.queue(kind);
        }, delay);
    }

    private cancelTimer(): void {
        if (this.timer === null) return;
        this.scheduler.clearTimeout(this.timer);
        this.timer = null;
    }
}
