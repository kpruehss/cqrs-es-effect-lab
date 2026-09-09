CREATE TABLE events (
  stream_id    TEXT NOT NULL,
  version      INTEGER NOT NULL,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (stream_id, version)
);
-- PRIMARY KEY (stream_id, version) both orders rows for loadEvents and gives
-- optimistic concurrency for free: a conflicting append is a unique-violation.

CREATE TABLE bank_account_projection (
  account_id   TEXT PRIMARY KEY,
  balance      BIGINT NOT NULL,     -- integer minor units (cents), never floating dollars
  status       TEXT NOT NULL,       -- 'open' | 'closed'
  opened_at    TIMESTAMPTZ NOT NULL
);
-- balance is BIGINT cents (see the money.ts note in The Decider Abstraction): money is
-- modelled as branded integer Cents end-to-end, so the projection stores exact integers
-- and dollars exist only on the HTTP wire. node-postgres returns BIGINT as a *string*
-- (it can exceed JS safe-integer range) — getAccount parses it back into Cents.
