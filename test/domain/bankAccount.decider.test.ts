import { DateTime, Effect, Exit, Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { BankAccountCommand } from "../../src/domain/bankAccount/commands";
import { bankAccountDecider } from "../../src/domain/bankAccount/decider";
import {
  AccountAlreadyOpen,
  AccountClosedError,
  AccountNotFound,
  BalanceOverflow,
  InsufficientFunds,
} from "../../src/domain/bankAccount/errors";
import { AccountClosed, AccountOpened, Deposited, Withdrawn } from "../../src/domain/bankAccount/events";
import type { BankAccountState } from "../../src/domain/bankAccount/state";
import { BalanceCents, Cents } from "../../src/domain/money";

/*
 * Amounts are constructed through the Cents schema, balances through BalanceCents -
 * each through its own parser and never as bare numbers. decodeSync throws on bad input, which suits test fixtures.
 */
const cents = Schema.decodeSync(Cents);
const balance = Schema.decodeSync(BalanceCents);

// Reusable states
const nonExistent: BankAccountState = { _tag: "NonExistent" };
const openWith = (bal: number): BankAccountState => ({ _tag: "Open", accountId: "a1", balance: balance(bal) });
const closed: BankAccountState = { _tag: "Closed", accountId: "a1" };

// Run decide and pull the (single) event out of a successful Exit, failing the test otherwise.
const decideOk = (command: Parameters<typeof bankAccountDecider.decide>[0], state: BankAccountState) => {
  const exit = Effect.runSyncExit(bankAccountDecider.decide(command, state));
  if (Exit.isFailure(exit)) throw new Error(`expected success, got failure: ${JSON.stringify(exit)}`);
  return exit.value;
};

// --- The invariants: decide must REJECT with the correct domain error --------------------------

describe("invariants (rejections)", () => {
  it("rejects opening an account that already exists (AccountAlreadyOpen)", () => {
    const result = Effect.runSyncExit(bankAccountDecider.decide({ _tag: "OpenAccount", accountId: "a1" }, openWith(0)));
    expect(result).toEqual(Exit.fail(new AccountAlreadyOpen({ accountId: "a1" })));
  });

  it("rejects operating on a nonexistent account (AccountNotFound)", () => {
    const result = Effect.runSyncExit(
      bankAccountDecider.decide({ _tag: "Deposit", accountId: "a1", amount: cents(5000) }, nonExistent),
    );
    expect(result).toEqual(Exit.fail(new AccountNotFound({ accountId: "a1" })));
  });

  it("rejects operating on a closed account (AccountClosedError)", () => {
    const result = Effect.runSyncExit(
      bankAccountDecider.decide({ _tag: "Deposit", accountId: "a1", amount: cents(5000) }, closed),
    );
    expect(result).toEqual(Exit.fail(new AccountClosedError({ accountId: "a1" })));
  });

  it("rejects withdrawal beyond balance (InsufficientFunds)", () => {
    const result = Effect.runSyncExit(
      bankAccountDecider.decide({ _tag: "Withdraw", accountId: "a1", amount: cents(5000) }, openWith(1000)),
    );
    expect(result).toEqual(Exit.fail(new InsufficientFunds({ requested: cents(5000), available: balance(1000) })));
  });

  it("rejects a deposit that would overflow the safe-integer ceiling (BalanceOverflow)", () => {
    // Start near MAX_SAFE_INTEGER so a valid (capped) deposit pushes past it.
    const nearCeiling = balance(Number.MAX_SAFE_INTEGER - 1);
    const exit = Effect.runSyncExit(
      bankAccountDecider.decide({ _tag: "Deposit", accountId: "a1", amount: cents(10_000) }, openWith(nearCeiling)),
    );
    // Assert it failed with BalanceOverflow. attempted = (MAX_SAFE_INTEGER - 1) + 10000.
    expect(exit).toEqual(Exit.fail(new BalanceOverflow({ attempted: Number.MAX_SAFE_INTEGER - 1 + 10_000 })));
  });
});

// --- Happy paths: decide must ACCEPT and emit the correct event + payload -----------------------

describe("acceptances (happy paths)", () => {
  it("OpenAccount on a nonexistent account emits AccountOpened", () => {
    const events = decideOk({ _tag: "OpenAccount", accountId: "a1" }, nonExistent);
    expect(events).toHaveLength(1);
    expect(events[0]._tag).toBe("AccountOpened");
    expect((events[0] as { accountId: string }).accountId).toBe("a1");
    expect((events[0] as { openedAt: unknown }).openedAt).toBeDefined();
  });

  it("Deposit on an open account emits Deposited with the same amount", () => {
    const events = decideOk({ _tag: "Deposit", accountId: "a1", amount: cents(5000) }, openWith(0));
    expect(events).toHaveLength(1);
    expect(events[0]._tag).toBe("Deposited");
    expect((events[0] as { amount: number }).amount).toBe(cents(5000));
    expect((events[0] as { depositedAt: unknown }).depositedAt).toBeDefined();
  });

  it("Withdraw within balance emits Withdrawn with the same amount", () => {
    const events = decideOk({ _tag: "Withdraw", accountId: "a1", amount: cents(2000) }, openWith(5000));
    expect(events).toHaveLength(1);
    expect(events[0]._tag).toBe("Withdrawn");
    expect((events[0] as { amount: number }).amount).toBe(cents(2000));
  });

  it("CloseAccount on an open account emits AccountClosed", () => {
    const events = decideOk({ _tag: "CloseAccount", accountId: "a1" }, openWith(0));
    expect(events).toHaveLength(1);
    expect(events[0]._tag).toBe("AccountClosed");
  });
});

// --- evolve: folding events must produce the correct state --------------------------------------

// --- evolve in isolation: given events, the fold produces the right state ----------------------
// Events are built by hand here (no `decide`), so these tests make NO claim about decide — they
// prove only that folding a given event sequence yields the expected state. A fixed timestamp
// keeps them fully deterministic.

describe("evolve (fold, events built directly)", () => {
  const t = DateTime.unsafeMake(0); // fixed epoch timestamp — evolve ignores it, but events require it

  it("folds open, +5000, -2000 into an Open account with balance 3000", () => {
    const events = [
      new AccountOpened({ accountId: "a1", openedAt: t }),
      new Deposited({ amount: cents(5000), depositedAt: t }),
      new Withdrawn({ amount: cents(2000), withdrawnAt: t }),
    ];
    const state = events.reduce(bankAccountDecider.evolve, bankAccountDecider.initialState);
    expect(state).toEqual({ _tag: "Open", accountId: "a1", balance: balance(3000) });
  });

  it("folds through AccountClosed into a Closed state carrying only accountId", () => {
    const events = [new AccountOpened({ accountId: "a1", openedAt: t }), new AccountClosed({ closedAt: t })];
    const state = events.reduce(bankAccountDecider.evolve, bankAccountDecider.initialState);
    expect(state).toEqual({ _tag: "Closed", accountId: "a1" });
  });
});

describe("command sequence (state threaded, mini handleCommand)", () => {
  const handle = (state: BankAccountState, command: BankAccountCommand): BankAccountState => {
    const events = decideOk(command, state); // decide against the REAL current state
    return events.reduce(bankAccountDecider.evolve, state); // fold results forward to next state
  };

  it("open, deposit 5000, withdraw 2000 => balance 3000, threading state each step", () => {
    const s1 = handle(bankAccountDecider.initialState, { _tag: "OpenAccount", accountId: "a1" });
    const s2 = handle(s1, { _tag: "Deposit", accountId: "a1", amount: cents(5000) });
    const s3 = handle(s2, { _tag: "Withdraw", accountId: "a1", amount: cents(2000) });
    expect(s3).toEqual({ _tag: "Open", accountId: "a1", balance: balance(3000) });
  });

  it("open then close => Closed, threading state each step", () => {
    const s1 = handle(bankAccountDecider.initialState, { _tag: "OpenAccount", accountId: "a1" });
    const s2 = handle(s1, { _tag: "CloseAccount", accountId: "a1" });
    expect(s2).toEqual({ _tag: "Closed", accountId: "a1" });
  });
});
