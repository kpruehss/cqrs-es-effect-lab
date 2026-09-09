import { Either, Schema } from "effect";
import { BalanceOverflow } from "./bankAccount/errors";

/*
 * Cents: a positive whole number of minor units (ex 5000 == $50.00).
 * Branded so it can't be interchanged with plain integers/floats.
 * Constructable only via Schema.decode to enforce parsing over validation
 */
export const Cents = Schema.Int.pipe(
  Schema.positive(), // All transactions must have a positive amount to be transacted
  Schema.lessThanOrEqualTo(1_000_000), // sane upper bound for transaction amounts
  Schema.brand("Cents"),
);
export type Cents = typeof Cents.Type;

/*
 * The wire/HTTP representation is major units (dollars) as sent by clients.
 * This transform schema is the parser: decode dollars -> Cents, encode Cents -> dollars
 * Rounding is pinned explicitly to avoid floating point precision issues.
 */
export const DollarsToCents = Schema.transform(Schema.Number.pipe(Schema.finite()), Cents, {
  strict: true,
  decode: (dollars) => Math.round(dollars * 100) as Cents,
  encode: (cents) => cents / 100,
});

/*
 * --- Two distinct money types, same unit (integer cents), different sign rules ---
 * Cents: a TRANSACTION AMOUNT. Always > 0! Deposit/Withdrawal of 0 or negative values is nonsensical
 * Direction is carried by the command (Deposit/Withdrawal), never by the sign of the amount!
 *
 * BalanceCents (below): an ACCUMULATED BALANCE. Signed! It may be negative if the domain permits it
 * (overdraft, credit line). Deliberately NOT constrained to positive:
 * "how negative may a balance go?" is a business rule for the `decide`, not a codec refinement.
 * As it is state-dependent (overdraft/credit limit), no type can encode it
 */
export const BalanceCents = Schema.Int.pipe(Schema.brand("BalanceCents"));
export type BalanceCents = typeof BalanceCents.Type;

/*
 * Zero values for Cents and BalanceCents using synchronous decoding. Runs once on boot to add compile and runtime
 * guarantee that 0 actually satisfies the Cents/BalanceCents schema. Fails loudly at boot if future refinement forbids
 * 0 balance/amounts. No runtime cost as this runs only once to assert compliance
 */
export const zeroCents = Schema.decodeSync(Cents)(0);
export const zeroBalance = Schema.decodeSync(BalanceCents)(0);

/*
 * Brand preserving arithmetic helpers to keep narrowed types after arithmetic operations
 */
export const addCents = (a: Cents, b: Cents): Cents => (a + b) as Cents;
export const subCents = (a: Cents, b: Cents): Cents => (a - b) as Cents;

/*
 * Brand-preserving arithmetic: a signed balance combined with a positive amount yields a new signed balance.
 * The direction ("dir") makes the credit/debit intent explicit at the call site (evolve's Deposited/Withdrawn events)
 */
export const applyToBalance = (balance: BalanceCents, amount: Cents, dir: "credit" | "debit"): BalanceCents =>
  (dir === "credit" ? balance + amount : balance - amount) as BalanceCents;

/*
 * Safe-integer ceiling as enforced invariant, checked at decide-time
 */
export const nextBalance = (
  balance: BalanceCents,
  amount: Cents,
  dir: "credit" | "debit",
): Either.Either<BalanceCents, BalanceOverflow> => {
  const raw = dir === "credit" ? balance + amount : balance - amount;
  return Number.isSafeInteger(raw)
    ? Either.right(raw as BalanceCents)
    : Either.left(new BalanceOverflow({ attempted: raw }));
};
