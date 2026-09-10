import {SqlClient} from "@effect/sql";
import type {SqlError} from "@effect/sql/SqlError";
import {Context, DateTime, Effect, Layer, Schema} from "effect";
import {AccountNotFound} from "../domain/bankAccount/errors";
import type {BankAccountEvent} from "../domain/bankAccount/events";
import {applyToBalance, BalanceCents, zeroBalance} from "../domain/money";

export interface BankAccountProjection {
  readonly accountId: string;
  readonly balance: BalanceCents;
  readonly status: "open" | "closed";
  readonly openedAt: DateTime.Utc;
}

export interface ReadModelShape {
  readonly project: (
    accountId: string,
    events: ReadonlyArray<BankAccountEvent>,
  ) => Effect.Effect<void, SqlError>;
  readonly getAccount: (
    accountId: string,
  ) => Effect.Effect<BankAccountProjection, AccountNotFound | SqlError>;
}

export class ReadModel extends Context.Tag("ReadModel")<ReadModel, ReadModelShape>() {
  static readonly Live = Layer.effect(
    ReadModel,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return {
        project: (accountId, events) =>
          Effect.forEach(
            events,
            (event) => {
              switch (event._tag) {
                case "AccountOpened":
                  return sql`INSERT INTO bank_account_projection ${sql.insert({
                      account_id: accountId,
                      balance: 0,
                      status: "open",
                      opened_at: event.openedAt,
                  })}`;
                case "Deposited":
                  return sql`UPDATE bank_account_projection
                             SET balance = balance + ${event.amount}
                             WHERE account_id = ${accountId}`;
                case "Withdrawn":
                  return sql`UPDATE bank_account_projection
                             SET balance = balance - ${event.amount}
                             WHERE account_id = ${accountId}`;
                case "AccountClosed":
                  return sql`UPDATE bank_account_projection
                             SET status = "closed"
                             WHERE account_id = ${accountId}`;
              }
            },
            {discard: true},
          ),

        getAccount: (accountId) =>
          Effect.gen(function* () {
            const rows = yield* sql<{
              account_id: string;
              balance: string;
              status: "open" | "closed";
              opened_at: Date;
            }>`SELECT account_id, balance, status, opened_at
               FROM bank_account_projection
               WHERE account_id = ${accountId}`;
            if (rows.length === 0) return yield* Effect.fail(new AccountNotFound({accountId}));
            const r = rows[0];
            return {
              accountId: r.account_id,
              balance: Schema.decodeSync(BalanceCents)(Number(r.balance)),
              status: r.status,
              openedAt: DateTime.unsafeFromDate(r.opened_at),
            };
          }),
      };
    }),
  );

  static readonly Test = Layer.sync(ReadModel, () => {
    const projections = new Map<string, BankAccountProjection>();
    return {
      project: (accountId, events) =>
        Effect.sync(() => {
          for (const event of events) {
            switch (event._tag) {
              case "AccountOpened":
                projections.set(accountId, {
                  accountId,
                  balance: zeroBalance,
                  status: "open",
                  openedAt: event.openedAt,
                });
                break;
              case "Deposited": {
                const current = projections.get(accountId)!;
                projections.set(accountId, {
                  ...current,
                  balance: applyToBalance(current.balance, event.amount, "credit"),
                });
                break;
              }
              case "Withdrawn": {
                const current = projections.get(accountId)!;
                projections.set(accountId, {
                  ...current,
                  balance: applyToBalance(current.balance, event.amount, "debit"),
                });
                break;
              }
              case "AccountClosed": {
                const curent = projections.get(accountId)!
                projections.set(accountId, {...curent, status: "closed"})

                break;
              }
            }
          }
        }),
      getAccount: (accountId) => {
        const projection = projections.get(accountId)
        return projection ? Effect.succeed(projection) : Effect.fail(new AccountNotFound({accountId}))
      }
    };
  });
}
