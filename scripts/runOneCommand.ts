/**
 * Smoke-test script: sends several BankAccount commands through the full
 * write-side stack (handleCommand → decider → EventStore.Live → Postgres).
 *
 * Run: pnpm run-command
 * Then inspect: psql -h localhost -U lab -d cqrs_es_lab -c "SELECT * FROM events;"
 */
import { NodeRuntime } from "@effect/platform-node";
import { PgClient } from "@effect/sql-pg";
import { Config, Console, Effect, Schema } from "effect";
import { handleCommand } from "../src/commandHandler";
import { bankAccountDecider } from "../src/domain/bankAccount/decider";
import { fromStoredEvent, toStoredEvent } from "../src/domain/bankAccount/serialize";
import { Cents } from "../src/domain/money";
import { EventStore } from "../src/eventstore/EventStore";
import { ReadModel } from "../src/projection/ReadModel";

const SqlLive = PgClient.layerConfig({
  host: Config.string("PGHOST"),
  port: Config.integer("PGPORT"),
  database: Config.string("PGDATABASE"),
  username: Config.string("PGUSER"),
  password: Config.redacted("PGPASSWORD"),
});

const handleBankAccountCommand = handleCommand(bankAccountDecider, toStoredEvent, fromStoredEvent);

const program = Effect.gen(function* () {
  const readModel = yield* ReadModel;
  const cents = Schema.decodeSync(Cents);
  const accountId = "account-1";

  let newEvent = yield* handleBankAccountCommand(accountId, {
    _tag: "OpenAccount",
    accountId,
  });
  yield* readModel.project(accountId, newEvent);
  yield* Console.log("Appended events:", newEvent);

  newEvent = yield* handleBankAccountCommand(accountId, {
    _tag: "Deposit",
    accountId,
    amount: cents(50000),
  });
  yield* readModel.project(accountId, newEvent);
  yield* Console.log("Appended events:", newEvent);

  newEvent = yield* handleBankAccountCommand(accountId, {
    _tag: "Deposit",
    accountId,
    amount: cents(10000),
  });
  yield* readModel.project(accountId, newEvent);
  yield* Console.log("Appended events:", newEvent);

  newEvent = yield* handleBankAccountCommand(accountId, {
    _tag: "Withdraw",
    accountId,
    amount: cents(30000),
  });
  yield* readModel.project(accountId, newEvent);

  const res = yield* readModel.getAccount(accountId);
  yield* Console.log("Appended events:", newEvent);
  yield* Console.log("Account Projection:", res);
});

program.pipe(
  Effect.provide(EventStore.Live),
  Effect.provide(ReadModel.Live),
  Effect.provide(SqlLive),
  NodeRuntime.runMain,
);
