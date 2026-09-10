import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";
import { EventStore } from "../../src/eventstore/EventStore";

// SqlLive: talks to the actual DB
describe("EventStore Test", () => {
  it.effect("appendEvents then loadEvents round-trips", () =>
    Effect.gen(function* () {
      const store = yield* EventStore;
      yield* store.appendEvents("stream-1", 0, [{ eventType: "Test", payload: { x: 1 } }]);
      const events = yield* store.loadEvents("stream-1");
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("Test");
      expect(events[0].payload).toEqual({ x: 1 });
    }).pipe(Effect.provide(EventStore.Test)),
  );
});
