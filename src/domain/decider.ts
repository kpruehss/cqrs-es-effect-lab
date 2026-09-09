import type { Effect } from "effect";

export interface Decider<Command, State, Event, DomainError> {
  readonly decide: (command: Command, state: State) => Effect.Effect<ReadonlyArray<Event>, DomainError>;
  readonly evolve: (state: State, event: Event) => State;
  readonly initialState: State;
  readonly isTerminal: (state: State) => boolean;
}
