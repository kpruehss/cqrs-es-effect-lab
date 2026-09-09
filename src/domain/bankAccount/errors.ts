import { Data } from "effect";

export class AccountNotFound extends Data.TaggedError("AccountNotFound")<{ accountId: string }> {}

export class AccountAlreadyOpen extends Data.TaggedError("AccountAlreadyOpen")<{ accountId: string }> {}

export class AccountClosedError extends Data.TaggedError("AccountClosedError")<{ accountId: string }> {}

export class InsufficientFunds extends Data.TaggedError("InsufficientFunds")<{
  requested: number;
  available: number;
}> {}

export type BankAccountError = AccountNotFound | AccountAlreadyOpen | AccountClosedError | InsufficientFunds;
