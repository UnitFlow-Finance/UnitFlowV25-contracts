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

The script verifies chain ID `5042002`, deploys the factory and both routers, creates a 10% tax
token, whitelists the liquidity router, adds USDC liquidity, executes taxed swaps in both directions,
and removes liquidity while asserting that the whitelisted liquidity operations are not taxed.

Tax tokens must exempt `UnitFlowV25LiquidityRouter` according to their own exemption mechanism.
The swap router deliberately remains non-exempt so fee-on-transfer swap paths can measure actual
pair inputs and recipient outputs.

## Verified Arc testnet deployment

Deployed and integration-tested on 2026-09-26:

These addresses are retained as historical test evidence for the superseded pre-branding bytecode.
The renamed UnitFlow contracts require a fresh deployment before production use.

- Factory: `0x58005506FeC589EDd462f7936fddE3bd31c5652b`
- Liquidity router: `0x0Fa2FCEa6CFE583eF759869625F918AA06280d16`
- Swap router: `0xaffEF95Ba487761679A16F835940132906Eb1633`
- 10% test tax token: `0x5F5fB25b29e6ef9196bA7191374529FB43566a46`
- TAX/USDC pair: `0x9c04aCa3ab823dB4A22fd6DD41b08e0e009F3780`
