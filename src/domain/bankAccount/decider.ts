import { DateTime, Effect } from "effect";
import type { Decider } from "../decider";
import { applyToBalance, nextBalance, zeroBalance } from "../money";
import type { BankAccountCommand } from "./commands";
import {
  AccountAlreadyOpen,
  AccountClosedError,
  AccountNotFound,
  type BankAccountError,
  InsufficientFunds,
} from "./errors.js";
import { AccountClosed, AccountOpened, type BankAccountEvent, Deposited, Withdrawn } from "./events";
import type { BankAccountState } from "./state.js";

export const bankAccountDecider: Decider<BankAccountCommand, BankAccountState, BankAccountEvent, BankAccountError> = {
  initialState: { _tag: "NonExistent" },
  isTerminal: (state) => state._tag === "Closed",
  evolve: (state, event) => {
    switch (event._tag) {
      case "AccountOpened":
        return { _tag: "Open", accountId: event.accountId, balance: zeroBalance };
      case "Deposited":
        return state._tag === "Open"
          ? { ...state, balance: applyToBalance(state.balance, event.amount, "credit") }
          : state;
      case "Withdrawn":
        return state._tag === "Open"
          ? { ...state, balance: applyToBalance(state.balance, event.amount, "debit") }
          : state;
      case "AccountClosed":
        return state._tag === "Open" ? { _tag: "Closed", accountId: state.accountId } : state;
    }
  },
  decide: (command, state) =>
    Effect.gen(function* () {
      switch (command._tag) {
        case "OpenAccount": {
          if (state._tag !== "NonExistent") {
            return yield* Effect.fail(new AccountAlreadyOpen({ accountId: command.accountId }));
          }
          const openedAt = yield* DateTime.now;
          return [new AccountOpened({ accountId: command.accountId, openedAt })];
        }
        case "Deposit": {
          if (state._tag === "NonExistent")
            return yield* Effect.fail(new AccountNotFound({ accountId: command.accountId }));
          if (state._tag === "Closed")
            return yield* Effect.fail(new AccountClosedError({ accountId: command.accountId }));
          const depositedAt = yield* DateTime.now;
          // Guard the projected balance against safe-integer ceiling before emitting the event
          yield* nextBalance(state.balance, command.amount, "credit");
          return [new Deposited({ amount: command.amount, depositedAt })];
        }
        case "Withdraw": {
          if (state._tag === "NonExistent")
            return yield* Effect.fail(new AccountNotFound({ accountId: command.accountId }));
          if (state._tag === "Closed")
            return yield* Effect.fail(new AccountClosedError({ accountId: command.accountId }));
          // No overdraft or credit lines supported *yet*.
          // When support is added, make check explicit using nextBalance()
          if (command.amount > state.balance) {
            return yield* Effect.fail(new InsufficientFunds({ requested: command.amount, available: state.balance }));
          }
          const withdrawnAt = yield* DateTime.now;
          return [new Withdrawn({ amount: command.amount, withdrawnAt })];
        }
        case "CloseAccount": {
          if (state._tag === "NonExistent")
            return yield* Effect.fail(new AccountNotFound({ accountId: command.accountId }));
          if (state._tag === "Closed")
            return yield* Effect.fail(new AccountClosedError({ accountId: command.accountId }));
          const closedAt = yield* DateTime.now;
          return [new AccountClosed({ closedAt })];
        }
      }
    }),
};
