# UnitFlow V2.5 on Arc

Arc exposes its native gas asset through the standard 6-decimal ERC-20 USDC system contract at
`0x3600000000000000000000000000000000000000`. The routers use ERC-20 approvals and transfers;
they do not wrap native value and do not accept payable liquidity or swap calls.

## Local verification

```bash
npm ci
npm run compile
npm test
```

## Arc testnet deployment and integration test

Fund a dedicated Arc testnet deployer, then set its key only in the local environment:

```bash
export PRIVATE_KEY=0x...
npx hardhat run scripts/deploy-and-test-arc.js --network arcTestnet
```

To deploy only the factory, liquidity router, and swap router in one command:

```bash
npm run deploy:arc
```

This deploys the factory first, passes its address and Arc USDC to both routers, verifies their
bindings on-chain, and prints the three addresses, transaction hashes, explorer links, and frontend
environment values together.

Latest verified `npm run deploy:arc` smoke deployment (2026-09-26):

- Factory: `0xE5E8528dA254885451a5F0c26d506937A8F03151`
- Liquidity router: `0xe389A8dec979910409F1c3E449F62E76589863e4`
- Swap router: `0xA298944D29E292aDdF22F2Dd8CE6FBC62bdbd299`

The script verifies chain ID `5042002`, deploys the factory and both routers, creates a 10% tax
token, whitelists the liquidity router, adds USDC liquidity, executes taxed swaps in both directions,
and removes liquidity while asserting that the whitelisted liquidity operations are not taxed.

Tax tokens must exempt `UnitFlowV25LiquidityRouter` according to their own exemption mechanism.
The swap router deliberately remains non-exempt so fee-on-transfer swap paths can measure actual
pair inputs and recipient outputs.

## Active UnitFlow Arc testnet deployment

Deployed and integration-tested on 2026-09-26:

- Factory: `0x6C6E85DC0AEEEe40cFbd1D566ffe989464949897`
- Liquidity router: `0x32b3d1C8CD92e5a9DCC474Da26BA49873DF29cD4`
- Swap router: `0x0C731949cf6Eb4F25A390e198f2B5830080B06f6`
- 10% test tax token: `0x02384bdb4E38065bC71d162dDBD7f39A988Bf6f2`
- TAX/USDC pair: `0xdd16134C0c5093000FBf0b72Cd0dEE688Cc750DB`

All deployment transactions succeeded. Runtime bytecode matches the compiled artifacts after
normalizing router immutable values. The integration run verified router bindings, liquidity-token
minting, taxed swaps in both directions, untaxed whitelisted liquidity addition/removal, and pair
reserve movements.

### Historical deployment

These addresses are retained as test evidence for the superseded pre-branding bytecode:

- Factory: `0x58005506FeC589EDd462f7936fddE3bd31c5652b`
- Liquidity router: `0x0Fa2FCEa6CFE583eF759869625F918AA06280d16`
- Swap router: `0xaffEF95Ba487761679A16F835940132906Eb1633`
- 10% test tax token: `0x5F5fB25b29e6ef9196bA7191374529FB43566a46`
- TAX/USDC pair: `0x9c04aCa3ab823dB4A22fd6DD41b08e0e009F3780`
