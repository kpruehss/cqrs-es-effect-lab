export type BankAccountCommand =
  | { readonly _tag: "OpenAccount"; readonly accountId: string }
  | { readonly _tag: "Deposit"; readonly accountId: string; readonly amount: number }
  | { readonly _tag: "Withdraw"; readonly accountId: string; readonly amount: number }
  | { readonly _tag: "CloseAccount"; readonly accountId: string };
