export type BankAccountState =
  | { readonly _tag: "NonExistent" }
  | { readonly _tag: "Open"; readonly accountId: string; readonly balance: number }
  | { readonly _tag: "Closed"; readonly accountId: string };
