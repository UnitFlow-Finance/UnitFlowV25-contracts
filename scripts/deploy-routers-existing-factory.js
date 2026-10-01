const hre = require("hardhat");

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_NETWORKS = {
  "5042": {
    name: "Arc mainnet",
    explorer: "https://explorer.arc.io",
    confirmationVariable: "CONFIRM_ARC_MAINNET_ROUTER_DEPLOYMENT",
  },
  "5042002": {
    name: "Arc testnet",
    explorer: "https://testnet.arcscan.app",
  },
};

function requiredAddress(ethers, name, value) {
  if (!value) throw new Error(`${name} is required`);
  try {
    const address = ethers.getAddress(value);
    if (address === ethers.ZeroAddress) throw new Error("zero address");
    return address;
  } catch (error) {
    throw new Error(`${name} must be a non-zero address: ${error.message}`);
  }
}

function confirmationCount(value) {
  if (value === undefined) return 1;
  if (!/^\d+$/.test(value)) throw new Error("DEPLOY_CONFIRMATIONS must be an integer from 1 to 20");
  const confirmations = Number(value);
  if (confirmations < 1 || confirmations > 20) {
    throw new Error("DEPLOY_CONFIRMATIONS must be an integer from 1 to 20");
  }
  return confirmations;
}

async function validateDependencies(ethers, factoryAddress, usdcAddress) {
  if (factoryAddress === usdcAddress) throw new Error("FACTORY_ADDRESS and USDC_ADDRESS must differ");

  const [factoryCode, usdcCode] = await Promise.all([
    ethers.provider.getCode(factoryAddress),
    ethers.provider.getCode(usdcAddress),
  ]);
  if (factoryCode === "0x") throw new Error(`No factory contract at ${factoryAddress}`);
  if (usdcCode === "0x") throw new Error(`No USDC contract at ${usdcAddress}`);

  const factory = new ethers.Contract(factoryAddress, [
    "function feeToSetter() view returns (address)",
    "function allPairsLength() view returns (uint256)",
  ], ethers.provider);
  const usdc = new ethers.Contract(usdcAddress, [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ], ethers.provider);

  let feeToSetter;
  let pairCount;
  let symbol;
  let decimals;
  try {
    [feeToSetter, pairCount, symbol, decimals] = await Promise.all([
      factory.feeToSetter(),
      factory.allPairsLength(),
      usdc.symbol(),
      usdc.decimals(),
    ]);
  } catch (error) {
    throw new Error(`Factory or USDC interface validation failed: ${error.message}`);
  }
  if (feeToSetter === ethers.ZeroAddress) throw new Error("Factory feeToSetter is the zero address");
  if (symbol !== "USDC" || decimals !== 6n) {
    throw new Error(`USDC validation failed: expected USDC/6, received ${symbol}/${decimals}`);
  }

  return { feeToSetter, pairCount };
}

async function deployRouters(ethers, factoryAddress, usdcAddress, confirmations = 1) {
  const dependencyInfo = await validateDependencies(ethers, factoryAddress, usdcAddress);
  const LiquidityRouter = await ethers.getContractFactory("UnitFlowV25LiquidityRouter");
  const SwapRouter = await ethers.getContractFactory("UnitFlowV25SwapRouter");

  const liquidityRouter = await LiquidityRouter.deploy(factoryAddress, usdcAddress);
  await liquidityRouter.waitForDeployment();
  await liquidityRouter.deploymentTransaction().wait(confirmations);

  const swapRouter = await SwapRouter.deploy(factoryAddress, usdcAddress);
  await swapRouter.waitForDeployment();
  await swapRouter.deploymentTransaction().wait(confirmations);

  const [liquidityFactory, liquidityUSDC, swapFactory, swapUSDC] = await Promise.all([
    liquidityRouter.factory(),
    liquidityRouter.USDC(),
    swapRouter.factory(),
    swapRouter.USDC(),
  ]);
  if (
    liquidityFactory !== factoryAddress || liquidityUSDC !== usdcAddress ||
    swapFactory !== factoryAddress || swapUSDC !== usdcAddress
  ) {
    throw new Error("Post-deployment router binding validation failed");
  }

  return {
    dependencyInfo,
    liquidityRouter: {
      address: await liquidityRouter.getAddress(),
      transactionHash: liquidityRouter.deploymentTransaction().hash,
    },
    swapRouter: {
      address: await swapRouter.getAddress(),
      transactionHash: swapRouter.deploymentTransaction().hash,
    },
  };
}

async function main() {
  const { ethers } = hre;
  const network = await ethers.provider.getNetwork();
  const networkConfig = ARC_NETWORKS[network.chainId.toString()];
  if (!networkConfig) {
    throw new Error(`Unsupported chain ${network.chainId}; expected Arc testnet or Arc mainnet`);
  }
  if (
    networkConfig.confirmationVariable &&
    process.env[networkConfig.confirmationVariable] !== "1"
  ) {
    throw new Error(
      `Arc mainnet deployment is locked. Set ${networkConfig.confirmationVariable}=1 after verifying all inputs.`,
    );
  }

  const factoryAddress = requiredAddress(ethers, "FACTORY_ADDRESS", process.env.FACTORY_ADDRESS);
  const usdcAddress = requiredAddress(ethers, "USDC_ADDRESS", process.env.USDC_ADDRESS || ARC_USDC);
  const confirmations = confirmationCount(process.env.DEPLOY_CONFIRMATIONS);
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error(`No deployer configured for ${networkConfig.name}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  if (balance === 0n) throw new Error(`Deployer ${deployer.address} has no gas balance`);

  console.log(`Deploying both routers from ${deployer.address} on ${networkConfig.name}`);
  console.log(`Existing factory: ${factoryAddress}`);
  console.log(`ERC-20 USDC: ${usdcAddress}`);
  const result = await deployRouters(ethers, factoryAddress, usdcAddress, confirmations);

  const output = {
    chainId: network.chainId.toString(),
    network: networkConfig.name,
    deployer: deployer.address,
    factory: factoryAddress,
    usdc: usdcAddress,
    existingPairCount: result.dependencyInfo.pairCount.toString(),
    liquidityRouter: result.liquidityRouter,
    swapRouter: result.swapRouter,
  };
  console.log("Router deployment complete and bindings verified:");
  console.log(JSON.stringify(output, null, 2));
  console.log("Explorer links:");
  console.log(`${networkConfig.explorer}/address/${result.liquidityRouter.address}`);
  console.log(`${networkConfig.explorer}/address/${result.swapRouter.address}`);
  console.log("Frontend environment values:");
  console.log(`NEXT_PUBLIC_LIQUIDITY_ROUTER=${result.liquidityRouter.address}`);
  console.log(`NEXT_PUBLIC_ROUTER_CONTRACT=${result.swapRouter.address}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  confirmationCount,
  deployRouters,
  requiredAddress,
  validateDependencies,
};
