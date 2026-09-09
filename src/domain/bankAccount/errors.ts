import { Data } from "effect";
import type { BalanceCents, Cents } from "../money";

export class AccountNotFound extends Data.TaggedError("AccountNotFound")<{ accountId: string }> {}

export class AccountAlreadyOpen extends Data.TaggedError("AccountAlreadyOpen")<{ accountId: string }> {}

export class AccountClosedError extends Data.TaggedError("AccountClosedError")<{ accountId: string }> {}

export class InsufficientFunds extends Data.TaggedError("InsufficientFunds")<{
  requested: Cents;
  available: BalanceCents;
}> {}

export class BalanceOverflow extends Data.TaggedError("BalanceOverflow")<{
  attempted: number;
}> {}

export type BankAccountError =
  | AccountNotFound
  | AccountAlreadyOpen
  | AccountClosedError
  | InsufficientFunds
  | BalanceOverflow;
