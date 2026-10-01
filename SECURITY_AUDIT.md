# Security review

Date: 2026-10-01

## Scope

- `UnitFlowV25LiquidityRouter` and `UnitFlowV25SwapRouter`
- Router interfaces, transfer helper, library, factory, and pair interactions
- Fee-on-transfer liquidity addition/removal and swap paths
- Existing-factory router deployment validation

## Result

No critical- or high-severity issue was identified in the reviewed scope. The fee-on-transfer
entry points measure transaction-local balance changes, do not sweep pre-existing router balances,
and revert token movements atomically when post-fee minimums are not met. Pair mint, burn, and swap
operations retain the pair-level reentrancy lock and constant-product checks.

This review is not a guarantee that the contracts are vulnerability-free and is not a substitute
for an independent audit before handling material value.

## Findings and assumptions

### Informational: arbitrary token behavior cannot be fully normalized

Fee-on-transfer tokens may apply asymmetric, dynamic, rebasing, reflection, sender-specific, or
recipient-specific balance changes. The supporting liquidity functions enforce minimum actual
receipts, but they cannot guarantee that two post-fee deposits preserve the pool's pre-existing
reserve ratio. The pair mints liquidity from the limiting side, so any excess on the other side
benefits existing liquidity providers. Callers should calculate conservative post-fee minimums and
review the token's transfer rules. Tokens with callbacks or non-standard balance behavior require
separate review.

### Informational: exact-output swaps do not support fee-on-transfer inputs

Only the explicitly named `SupportingFeeOnTransferTokens` exact-input functions support taxed
tokens. Exact-output and standard swap functions assume the requested input reaches the pair.

### Informational: deployment validation is compatibility-oriented

The router-only deployment script checks bytecode, expected read-only factory methods, USDC symbol
and decimals, supported Arc chain IDs, and post-deployment immutable bindings. It does not prove
that an arbitrary existing factory has identical runtime bytecode. Operators must independently
verify the intended factory address and ownership configuration.

## Verification performed

- Hardhat compilation with Solidity 0.5.16 and 0.6.6
- Project Hardhat tests, including taxed inputs/outputs, post-fee liquidity minimums, two taxed
  assets, stray-balance isolation, native-value rejection, and existing-factory deployment
- Solhint static analysis of the pair, factory, and both active routers; warnings were style,
  documentation, naming, and gas recommendations, with no reported error
- Manual review of authorization, reentrancy boundaries, external calls, arithmetic, slippage,
  path validation, balance accounting, native-value handling, and deployment safeguards
