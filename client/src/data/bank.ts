// P0-3 split: the bank now lives in ./bank/ modules. This shim keeps every existing import from "./bank" or "../data/bank" working unchanged.
export * from "./bank/index";
