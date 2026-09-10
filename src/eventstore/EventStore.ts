import { SqlClient } from "@effect/sql";
import type { SqlError } from "@effect/sql/SqlError";
import { Context, Effect, Layer, pipe } from "effect";
import { ConcurrencyConflict } from "./errors";

export interface NewEvent {
  readonly eventType: string;
  readonly payload: unknown;
}
export interface StoredEvent extends NewEvent {
  readonly version: number;
}

export interface EventStoreShape {
  readonly loadEvents: (streamId: string) => Effect.Effect<ReadonlyArray<StoredEvent>, SqlError>;
  readonly appendEvents: (
    streamId: string,
    expectedVersion: number,
    events: ReadonlyArray<NewEvent>,
  ) => Effect.Effect<void, ConcurrencyConflict | SqlError>;
}

const isUniqueViolation = (e: SqlError): boolean => {
  const cause = e.cause;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
};

export class EventStore extends Context.Tag("EventStore")<EventStore, EventStoreShape>() {
  static readonly Live = Layer.effect(
    EventStore,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return {
        loadEvents: (streamId) =>
          sql<{ event_type: string; payload: unknown; version: number }>`
            SELECT event_type, payload, version FROM events
            WHERE stream_id = ${streamId} ORDER BY version ASC
          `.pipe(
            Effect.map((rows) =>
              rows.map((r) => ({
                eventType: r.event_type,
                payload: r.payload,
                version: r.version,
              })),
            ),
          ),

        appendEvents: (streamId, expectedVersion, events) => {
          const insertAll = Effect.forEach(
            events,
            (event, i) =>
              sql`INSERT INTO events ${sql.insert({
                stream_id: streamId,
                version: expectedVersion + i + 1,
                event_type: event.eventType,
                payload: event.payload,
              })}`,
            { discard: true },
          );
          return pipe(
            // Wrap multi-event appends in a transaction. Either all events are committed or none are.
            sql.withTransaction(insertAll),
            Effect.mapError((e) =>
              isUniqueViolation(e) ? new ConcurrencyConflict({ streamId, expectedVersion }) : e,
            ),
          ) as Effect.Effect<void, ConcurrencyConflict | SqlError>;
        },
      } satisfies EventStoreShape;
    }),
  );

  static readonly Test = Layer.sync(EventStore, () => {
    const streams = new Map<string, StoredEvent[]>();
    return {
      loadEvents: (streamId) => Effect.succeed(streams.get(streamId) ?? []),
      appendEvents: (streamId, expectedVersion, events) => {
        const existing = streams.get(streamId) ?? [];
        if (existing.length !== expectedVersion) {
          return Effect.fail(new ConcurrencyConflict({ streamId, expectedVersion }));
        }
        const newRows = events.map((e, i) => ({ ...e, version: expectedVersion + i + 1 }));
        streams.set(streamId, [...existing, ...newRows]);
        return Effect.void;
      },
    };
  });
}
