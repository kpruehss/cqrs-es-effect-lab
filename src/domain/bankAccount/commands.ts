import type { Cents } from "../money";

export type BankAccountCommand =
  | { readonly _tag: "OpenAccount"; readonly accountId: string }
  | { readonly _tag: "Deposit"; readonly accountId: string; readonly amount: Cents }
  | { readonly _tag: "Withdraw"; readonly accountId: string; readonly amount: Cents }
  | { readonly _tag: "CloseAccount"; readonly accountId: string };
