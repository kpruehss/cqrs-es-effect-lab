/**
 * Smoke-test script: sends a single OpenAccount command through the full
 * write-side stack (handleCommand → decider → EventStore.Live → Postgres).
 *
 * Run: pnpm run-command
 * Then inspect: psql -h localhost -U lab -d cqrs_es_lab -c "SELECT * FROM events;"
 */
import { NodeRuntime } from "@effect/platform-node";
import { PgClient } from "@effect/sql-pg";
import { Config, Console, Effect } from "effect";
import { handleCommand } from "../src/commandHandler";
import { bankAccountDecider } from "../src/domain/bankAccount/decider";
import { fromStoredEvent, toStoredEvent } from "../src/domain/bankAccount/serialize";
import { EventStore } from "../src/eventstore/EventStore";

const SqlLive = PgClient.layerConfig({
  host: Config.string("PGHOST"),
  port: Config.integer("PGPORT"),
  database: Config.string("PGDATABASE"),
  username: Config.string("PGUSER"),
  password: Config.redacted("PGPASSWORD"),
});

const handleBankAccountCommand = handleCommand(bankAccountDecider, toStoredEvent, fromStoredEvent);

const program = Effect.gen(function* () {
  const accountId = "account-1";
  const newEvents = yield* handleBankAccountCommand(accountId, {
    _tag: "OpenAccount",
    accountId,
  });
  yield* Console.log("Appended events:", newEvents);
});

program.pipe(Effect.provide(EventStore.Live), Effect.provide(SqlLive), NodeRuntime.runMain);
