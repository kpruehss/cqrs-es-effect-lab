import { Schema } from "effect";
import { Cents } from "../money";

export class AccountOpened extends Schema.TaggedClass<AccountOpened>()("AccountOpened", {
  accountId: Schema.String,
  openedAt: Schema.DateTimeUtc,
}) {}

export class Deposited extends Schema.TaggedClass<Deposited>()("Deposited", {
  amount: Cents,
  depositedAt: Schema.DateTimeUtc,
}) {}

export class Withdrawn extends Schema.TaggedClass<Withdrawn>()("Withdrawn", {
  amount: Cents,
  withdrawnAt: Schema.DateTimeUtc,
}) {}

export class AccountClosed extends Schema.TaggedClass<AccountClosed>()("AccountClosed", {
  closedAt: Schema.DateTimeUtc,
}) {}

export type BankAccountEvent = AccountOpened | Deposited | Withdrawn | AccountClosed;
