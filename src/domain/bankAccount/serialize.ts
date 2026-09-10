import { Schema } from "effect";
import type { NewEvent, StoredEvent } from "../../eventstore/EventStore";
import {
  AccountClosed,
  AccountOpened,
  type BankAccountEvent,
  Deposited,
  Withdrawn,
} from "./events";

// Union schema over all 4 event types
const BankAccountEventSchema = Schema.Union(AccountOpened, AccountClosed, Deposited, Withdrawn);

// Encode: _tag doubles as EventType; payload is the full encoded struct
export const toStoredEvent = (event: BankAccountEvent): NewEvent => ({
  eventType: event._tag,
  payload: Schema.encodeSync(BankAccountEventSchema)(event),
});

export const fromStoredEvent = (stored: StoredEvent): BankAccountEvent =>
  Schema.decodeUnknownSync(BankAccountEventSchema)(stored.payload);
