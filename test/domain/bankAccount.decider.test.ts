import { Effect, Exit, Schema } from "effect";
import { expect, it } from "vitest";
import { bankAccountDecider } from "../../src/domain/bankAccount/decider";
import { InsufficientFunds } from "../../src/domain/bankAccount/errors";
import { BankAccountState } from "../../src/domain/bankAccount/state";
import { BalanceCents, Cents } from "../../src/domain/money";

/*
 * Amounts are constructed through the Cents schema, balances through BalanceCents -
 * each through its own parser and never as bare numbers. decodeSync throws on bad input, which suits test fixtures
 */
const cents = Schema.decodeSync(Cents);
const balance = Schema.decodeSync(BalanceCents);

it("rejects withdrawal beyond balance", () => {
  const state: BankAccountState = { _tag: "Open", accountId: "a1", balance: balance(1000) }; // $10.00
  const result = Effect.runSyncExit(
    bankAccountDecider.decide({ _tag: "Withdraw", accountId: "a1", amount: cents(5000) }, state), // $50.00
  );

  expect(result).toEqual(Exit.fail(new InsufficientFunds({ requested: cents(5000), available: balance(1000) })));
});
