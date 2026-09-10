import { Effect } from "effect";
import type { Decider } from "./domain/decider";
import { EventStore, type NewEvent, type StoredEvent } from "./eventstore/EventStore";
export const handleCommand =
  <Command, State, Event, DomainError>(
    decider: Decider<Command, State, Event, DomainError>,
    toStoredEvent: (e: Event) => NewEvent,
    fromStoredEvent: (s: StoredEvent) => Event,
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
    });
