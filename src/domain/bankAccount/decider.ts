import { DateTime, Effect } from "effect";
import { Decider } from "../decider";
import { BankAccountCommand } from "./commands";
import {
  AccountAlreadyOpen,
  AccountClosedError,
  AccountNotFound,
  BankAccountError,
  InsufficientFunds,
} from "./errors.js";
import { AccountClosed, AccountOpened, BankAccountEvent, Deposited, Withdrawn } from "./events.js";
import { BankAccountState } from "./state.js";

export const bankAccountDecider: Decider<BankAccountCommand, BankAccountState, BankAccountEvent, BankAccountError> = {
  initialState: { _tag: "NonExistent" },
  isTerminal: (state) => state._tag === "Closed",
  evolve: (state, event) => {
    switch (event._tag) {
      case "AccountOpened":
        return { _tag: "Open", accountId: event.accountId, balance: 0 };
      case "Deposited":
        return state._tag === "Open" ? { ...state, balance: state.balance + event.amount } : state;
      case "Withdrawn":
        return state._tag === "Open" ? { ...state, balance: state.balance - event.amount } : state;
      case "AccountClosed":
        return state._tag === "Open" ? { ...state, _tag: "Closed", accountId: state.accountId } : state;
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
          return [new Deposited({ amount: command.amount, depositedAt })];
        }
        case "Withdraw": {
          if (state._tag === "NonExistent")
            return yield* Effect.fail(new AccountNotFound({ accountId: command.accountId }));
          if (state._tag === "Closed")
            return yield* Effect.fail(new AccountClosedError({ accountId: command.accountId }));
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
