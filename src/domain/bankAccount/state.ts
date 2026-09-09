import type { BalanceCents } from "../money";

export type BankAccountState =
  | { readonly _tag: "NonExistent" }
  | { readonly _tag: "Open"; readonly accountId: string; readonly balance: BalanceCents }
  | { readonly _tag: "Closed"; readonly accountId: string };
