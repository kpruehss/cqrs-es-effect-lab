import { Data } from "effect";

export class ConcurrencyConflict extends Data.TaggedError("ConcurrencyConflict")<{
  streamId: string;
  expectedVersion: number;
}> {}
