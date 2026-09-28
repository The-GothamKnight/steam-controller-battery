import { describe, expect, test } from "bun:test";
import { disconnectedState, type BatteryState } from "../frontend/battery-state";
import {
    HEALTHY_RECONCILE_MS,
    UNAVAILABLE_BACKOFF_MS,
    XenonReconciler,
    type XenonRequestKind,
    type XenonSyncResult,
} from "../frontend/xenon-reconciliation";

const connected = (): BatteryState => ({
    ...disconnectedState(), connected: true, battery: 72, wireless: true,
});

class FakeTimers {
    private nextId = 1;
    private timers = new Map<number, { callback: () => void; delay: number }>();

    setTimeout = (callback: () => void, delay: number): number => {
        const id = this.nextId++;
        this.timers.set(id, { callback, delay });
        return id;
    };

    clearTimeout = (id: number): void => { this.timers.delete(id); };

    nextDelay(): number | undefined {
        return this.timers.values().next().value?.delay;
    }

    fire(): void {
        const [id, timer] = this.timers.entries().next().value ?? [];
        if (id === undefined || !timer) throw new Error("No scheduled timer");
        this.timers.delete(id);
        timer.callback();
    }
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function harness(results: XenonSyncResult[]) {
    const timers = new FakeTimers();
    const calls: XenonRequestKind[] = [];
    const changes: string[] = [];
    const reconciler = new XenonReconciler(
        async (kind) => {
            calls.push(kind);
            return results.shift() ?? { ok: true, published: false };
        },
        timers,
        (change) => changes.push(change),
    );
    return { timers, calls, changes, reconciler };
}

describe("Xenon reconciliation", () => {
    test("meaningful controller changes publish immediately while unchanged samples do not", async () => {
        const h = harness([{ ok: true, published: true }, { ok: true, published: true }]);
        h.reconciler.observe(connected());
        await settle();
        h.reconciler.observe(connected());
        h.reconciler.observe({ ...connected(), battery: 71 });
        await settle();
        expect(h.calls).toEqual(["publish", "publish"]);
    });

    test("a healthy matching reconciliation is GET-only from the publisher perspective", async () => {
        const h = harness([{ ok: true, published: true }, { ok: true, published: false }]);
        h.reconciler.observe(connected());
        await settle();
        expect(h.timers.nextDelay()).toBe(HEALTHY_RECONCILE_MS);
        h.timers.fire();
        await settle();
        expect(h.calls).toEqual(["publish", "ensure"]);
        expect(h.timers.nextDelay()).toBe(HEALTHY_RECONCILE_MS);
    });

    test("a missing or different Xenon state reconciles through ensure and may publish", async () => {
        const h = harness([{ ok: true, published: true }, { ok: true, published: true }, { ok: true, published: true }]);
        h.reconciler.observe(connected());
        await settle();
        h.timers.fire();
        await settle();
        h.timers.fire();
        await settle();
        expect(h.calls).toEqual(["publish", "ensure", "ensure"]);
    });

    test("failures use the bounded unavailable backoff", async () => {
        const h = harness([{ ok: false, error: "offline" }, { ok: false }, { ok: false }, { ok: false }, { ok: false }]);
        h.reconciler.observe(connected());
        await settle();
        for (const delay of UNAVAILABLE_BACKOFF_MS) {
            expect(h.timers.nextDelay()).toBe(delay);
            h.timers.fire();
            await settle();
        }
        expect(h.timers.nextDelay()).toBe(UNAVAILABLE_BACKOFF_MS.at(-1));
        expect(h.changes).toEqual(["unavailable"]);
    });

    test("successful recovery resets backoff and returns to healthy reconciliation", async () => {
        const h = harness([{ ok: false }, { ok: false }, { ok: true, published: true }, { ok: false }]);
        h.reconciler.observe(connected());
        await settle();
        h.timers.fire();
        await settle();
        expect(h.timers.nextDelay()).toBe(UNAVAILABLE_BACKOFF_MS[1]);
        h.timers.fire();
        await settle();
        expect(h.timers.nextDelay()).toBe(HEALTHY_RECONCILE_MS);
        expect(h.changes).toEqual(["unavailable", "restored"]);
        h.timers.fire();
        await settle();
        expect(h.timers.nextDelay()).toBe(UNAVAILABLE_BACKOFF_MS[0]);
    });

    test("a controller change during backoff attempts an immediate POST and restores healthy mode on success", async () => {
        const h = harness([{ ok: false }, { ok: true, published: true }]);
        h.reconciler.observe(connected());
        await settle();
        expect(h.timers.nextDelay()).toBe(UNAVAILABLE_BACKOFF_MS[0]);
        h.reconciler.observe({ ...connected(), charging: true });
        await settle();
        expect(h.calls).toEqual(["publish", "publish"]);
        expect(h.timers.nextDelay()).toBe(HEALTHY_RECONCILE_MS);
        expect(h.changes).toEqual(["unavailable", "restored"]);
    });
});
