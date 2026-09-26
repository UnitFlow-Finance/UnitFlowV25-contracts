const hre = require("hardhat");

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const MAX = hre.ethers.MaxUint256;
const TAX_COLLECTOR = "0x000000000000000000000000000000000000dEaD";

async function deploy(name, ...args) {
  const factory = await hre.ethers.getContractFactory(name);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("PRIVATE_KEY is required");

  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 5042002n) throw new Error(`Wrong chain: ${network.chainId}`);

  const usdc = new ethers.Contract(ARC_USDC, [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
  ], deployer);
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
  await (await taxToken.setTaxExempt(liquidityRouterAddress, true)).wait();
  await (await taxToken.approve(liquidityRouterAddress, MAX)).wait();
  await (await usdc.approve(liquidityRouterAddress, MAX)).wait();

  const taxLiquidity = ethers.parseEther("1000");
  const usdcLiquidity = ethers.parseUnits("2", 6);
  await (await liquidityRouter.addLiquidityUSDC(
    taxTokenAddress, taxLiquidity, usdcLiquidity, taxLiquidity, usdcLiquidity, deployer.address, MAX
  )).wait();

  const pairAddress = await factory.getPair(taxTokenAddress, ARC_USDC);
  const pair = await ethers.getContractAt("UnitFlowV25Pair", pairAddress, deployer);
  if (await taxToken.balanceOf(TAX_COLLECTOR) !== 0n) {
    throw new Error("Whitelisted liquidity addition was taxed");
  }

  await (await taxToken.setTaxExempt(deployer.address, false)).wait();
  await (await taxToken.approve(swapRouterAddress, MAX)).wait();
  await (await usdc.approve(swapRouterAddress, MAX)).wait();
  await (await swapRouter.swapExactTokensForUSDCSupportingFeeOnTransferTokens(
    ethers.parseEther("10"), 1, [taxTokenAddress, ARC_USDC], deployer.address, MAX
  )).wait();
  await (await swapRouter.swapExactUSDCForTokensSupportingFeeOnTransferTokens(
    ethers.parseUnits("0.01", 6), 1, [ARC_USDC, taxTokenAddress], deployer.address, MAX
  )).wait();
  if (await taxToken.balanceOf(TAX_COLLECTOR) === 0n) {
    throw new Error("Tax-token swap did not collect tax");
  }

  const taxBeforeRemoval = await taxToken.balanceOf(TAX_COLLECTOR);
  const lpBalance = await pair.balanceOf(deployer.address);
  await (await pair.approve(liquidityRouterAddress, lpBalance)).wait();
  await (await liquidityRouter.removeLiquidityUSDCSupportingFeeOnTransferTokens(
    taxTokenAddress, lpBalance / 10n, 1, 1, deployer.address, MAX
  )).wait();
  if (await taxToken.balanceOf(TAX_COLLECTOR) !== taxBeforeRemoval) {
    throw new Error("Whitelisted liquidity removal was taxed");
  }

  console.log("Arc deployment and integration tests passed:");
  console.log(JSON.stringify({
    chainId: network.chainId.toString(),
    usdc: ARC_USDC,
    factory: await factory.getAddress(),
    liquidityRouter: liquidityRouterAddress,
    swapRouter: swapRouterAddress,
    taxToken: taxTokenAddress,
    pair: pairAddress,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
