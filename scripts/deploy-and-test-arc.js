const hre = require("hardhat");

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const MAX = hre.ethers.MaxUint256;
const TAX_COLLECTOR = "0x000000000000000000000000000000000000dEaD";
const deploymentTransactions = {};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function deploy(name, ...args) {
  const factory = await hre.ethers.getContractFactory(name);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  deploymentTransactions[name] = contract.deploymentTransaction().hash;
  return contract;
}

async function reservesFor(pair, tokenA) {
  const [token0, reserves] = await Promise.all([pair.token0(), pair.getReserves()]);
  return token0.toLowerCase() === tokenA.toLowerCase()
    ? { reserveA: reserves[0], reserveB: reserves[1] }
    : { reserveA: reserves[1], reserveB: reserves[0] };
}

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("PRIVATE_KEY is required");

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 5042002n) throw new Error(`Wrong chain: ${network.chainId}`);

  const usdc = new ethers.Contract(ARC_USDC, [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
  ], deployer);
  const [usdcCode, usdcSymbol, usdcDecimals] = await Promise.all([
    ethers.provider.getCode(ARC_USDC), usdc.symbol(), usdc.decimals(),
  ]);
  assert(usdcCode !== "0x", "Arc USDC system contract has no code");
  assert(usdcSymbol === "USDC" && usdcDecimals === 6n, "Unexpected Arc USDC metadata");
  const startingUSDC = await usdc.balanceOf(deployer.address);
  if (startingUSDC < ethers.parseUnits("5", 6)) {
    throw new Error("At least 5 testnet USDC is required for deployment, liquidity, swaps, and gas");
  }

  const factory = await deploy("UnitFlowV25Factory", deployer.address);
  const liquidityRouter = await deploy("UnitFlowV25LiquidityRouter", await factory.getAddress(), ARC_USDC);
  const swapRouter = await deploy("UnitFlowV25SwapRouter", await factory.getAddress(), ARC_USDC);
  const taxToken = await deploy("TaxToken", ethers.parseEther("1000000"), 1000, TAX_COLLECTOR);

  const liquidityRouterAddress = await liquidityRouter.getAddress();
  const swapRouterAddress = await swapRouter.getAddress();
  const taxTokenAddress = await taxToken.getAddress();
  const factoryAddress = await factory.getAddress();
  assert(await liquidityRouter.factory() === factoryAddress, "Liquidity router factory mismatch");
  assert(await liquidityRouter.USDC() === ARC_USDC, "Liquidity router USDC mismatch");
  assert(await swapRouter.factory() === factoryAddress, "Swap router factory mismatch");
  assert(await swapRouter.USDC() === ARC_USDC, "Swap router USDC mismatch");

  await (await taxToken.setTaxExempt(liquidityRouterAddress, true)).wait();
  assert(await taxToken.isTaxExempt(liquidityRouterAddress), "Liquidity router exemption was not set");
  assert(!await taxToken.isTaxExempt(swapRouterAddress), "Swap router must remain taxable");
  await (await taxToken.approve(liquidityRouterAddress, MAX)).wait();
  await (await usdc.approve(liquidityRouterAddress, MAX)).wait();

  const taxLiquidity = ethers.parseEther("1000");
  const usdcLiquidity = ethers.parseUnits("2", 6);
  await (await liquidityRouter.addLiquidityUSDC(
    taxTokenAddress, taxLiquidity, usdcLiquidity, taxLiquidity, usdcLiquidity, deployer.address, MAX
  )).wait();

  const pairAddress = await factory.getPair(taxTokenAddress, ARC_USDC);
  const pair = await ethers.getContractAt("UnitFlowV25Pair", pairAddress, deployer);
  assert(pairAddress !== ethers.ZeroAddress, "Factory did not create the TAX/USDC pair");
  assert(await pair.balanceOf(deployer.address) > 0n, "Liquidity tokens were not minted");
  if (await taxToken.balanceOf(TAX_COLLECTOR) !== 0n) {
    throw new Error("Whitelisted liquidity addition was taxed");
  }

  await (await taxToken.setTaxExempt(deployer.address, false)).wait();
  assert(!await taxToken.isTaxExempt(deployer.address), "Deployer tax exemption was not removed");
  await (await taxToken.approve(swapRouterAddress, MAX)).wait();
  await (await usdc.approve(swapRouterAddress, MAX)).wait();
  const reservesBeforeTokenSwap = await reservesFor(pair, taxTokenAddress);
  await (await swapRouter.swapExactTokensForUSDCSupportingFeeOnTransferTokens(
    ethers.parseEther("10"), 1, [taxTokenAddress, ARC_USDC], deployer.address, MAX
  )).wait();
  const reservesAfterTokenSwap = await reservesFor(pair, taxTokenAddress);
  assert(
    reservesAfterTokenSwap.reserveA > reservesBeforeTokenSwap.reserveA &&
      reservesAfterTokenSwap.reserveB < reservesBeforeTokenSwap.reserveB,
    "Tax-token-to-USDC swap did not move pair reserves correctly"
  );
  assert(
    await taxToken.balanceOf(TAX_COLLECTOR) === ethers.parseEther("1"),
    "Swap router did not apply the configured 10% input tax"
  );

  const taxBeforeUSDCSwap = await taxToken.balanceOf(TAX_COLLECTOR);
  const reservesBeforeUSDCSwap = await reservesFor(pair, taxTokenAddress);
  await (await swapRouter.swapExactUSDCForTokensSupportingFeeOnTransferTokens(
    ethers.parseUnits("0.01", 6), 1, [ARC_USDC, taxTokenAddress], deployer.address, MAX
  )).wait();
  const reservesAfterUSDCSwap = await reservesFor(pair, taxTokenAddress);
  assert(
    reservesAfterUSDCSwap.reserveA < reservesBeforeUSDCSwap.reserveA &&
      reservesAfterUSDCSwap.reserveB > reservesBeforeUSDCSwap.reserveB,
    "USDC-to-tax-token swap did not move pair reserves correctly"
  );
  assert(
    await taxToken.balanceOf(TAX_COLLECTOR) > taxBeforeUSDCSwap,
    "USDC-to-tax-token swap did not apply output tax"
  );

  const taxBeforeRemoval = await taxToken.balanceOf(TAX_COLLECTOR);
  const lpBalance = await pair.balanceOf(deployer.address);
  const reservesBeforeRemoval = await reservesFor(pair, taxTokenAddress);
  await (await pair.approve(liquidityRouterAddress, lpBalance)).wait();
  await (await liquidityRouter.removeLiquidityUSDCSupportingFeeOnTransferTokens(
    taxTokenAddress, lpBalance / 10n, 1, 1, deployer.address, MAX
  )).wait();
  if (await taxToken.balanceOf(TAX_COLLECTOR) !== taxBeforeRemoval) {
    throw new Error("Whitelisted liquidity removal was taxed");
  }
  const reservesAfterRemoval = await reservesFor(pair, taxTokenAddress);
  assert(
    reservesAfterRemoval.reserveA < reservesBeforeRemoval.reserveA &&
      reservesAfterRemoval.reserveB < reservesBeforeRemoval.reserveB,
    "Liquidity removal did not reduce both pair reserves"
  );

  console.log("Arc deployment and integration tests passed:");
  console.log(JSON.stringify({
    chainId: network.chainId.toString(),
    usdc: ARC_USDC,
    factory: factoryAddress,
    liquidityRouter: liquidityRouterAddress,
    swapRouter: swapRouterAddress,
    taxToken: taxTokenAddress,
    pair: pairAddress,
    deploymentTransactions,
    checks: {
      arcUSDCMetadata: true,
      routerBindings: true,
      liquidityRouterTaxExempt: true,
      swapRouterTaxable: true,
      taxedSwapsBothDirections: true,
      liquidityAddRemoveUntaxed: true,
      reserveMovements: true,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
