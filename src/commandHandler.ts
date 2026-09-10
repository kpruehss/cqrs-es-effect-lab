import { Effect, Schedule } from "effect";
import type { Decider } from "./domain/decider";
import { EventStore, type NewEvent, type StoredEvent } from "./eventstore/EventStore";

const defaultRetryPolicy = Schedule.intersect(
  Schedule.recurs(3),
  Schedule.exponential("50 millis"),
);

export const handleCommand =
  <Command, State, Event, DomainError extends { readonly _tag: string }>(
    decider: Decider<Command, State, Event, DomainError>,
    toStoredEvent: (e: Event) => NewEvent,
    fromStoredEvent: (s: StoredEvent) => Event,
    retrySchedule: Schedule.Schedule<unknown, unknown> = defaultRetryPolicy,
  ) =>
  (streamId: string, command: Command) =>
    Effect.gen(function* () {
      const store = yield* EventStore;
      const stored = yield* store.loadEvents(streamId);
      const events = stored.map(fromStoredEvent);
      const state = events.reduce(decider.evolve, decider.initialState);
      const newEvents = yield* decider.decide(command, state);
      yield* store.appendEvents(streamId, stored.length, newEvents.map(toStoredEvent));

      return newEvents;
    }).pipe(
      Effect.retry({
        while: (e) => e._tag === "ConcurrencyConflict",
        schedule: retrySchedule,
      }),
    );
