const hre = require("hardhat");

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const ARC_NETWORKS = {
  "5042": {
    name: "Arc mainnet",
    explorer: "https://arc-scan.org",
    requiresConfirmation: true,
  },
  "5042002": {
    name: "Arc testnet",
    explorer: "https://testnet.arcscan.app",
    requiresConfirmation: false,
  },
};

async function deploy(name, args) {
  const Contract = await hre.ethers.getContractFactory(name);
  const contract = await Contract.deploy(...args);
  await contract.waitForDeployment();
  return {
    contract,
    address: await contract.getAddress(),
    transactionHash: contract.deploymentTransaction().hash,
  };
}

async function main() {
  const { ethers } = hre;
  const network = await ethers.provider.getNetwork();
  const arcNetwork = ARC_NETWORKS[network.chainId.toString()];
  if (!arcNetwork) {
    throw new Error(`Unsupported chain ${network.chainId}; expected Arc testnet or Arc mainnet`);
  }
  if (arcNetwork.requiresConfirmation && process.env.CONFIRM_ARC_MAINNET !== "1") {
    throw new Error(
      "Arc mainnet deployment is locked. Set CONFIRM_ARC_MAINNET=1 after checking the deployer and balance.",
    );
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    const keyName = arcNetwork.requiresConfirmation ? "MAINNET_PRIVATE_KEY" : "PRIVATE_KEY";
    throw new Error(`${keyName} is required for ${arcNetwork.name}`);
  }

  const usdc = new ethers.Contract(ARC_USDC, [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ], ethers.provider);
  const [usdcCode, symbol, decimals] = await Promise.all([
    ethers.provider.getCode(ARC_USDC), usdc.symbol(), usdc.decimals(),
  ]);
  if (usdcCode === "0x" || symbol !== "USDC" || decimals !== 6n) {
    throw new Error("Arc system USDC validation failed");
  }

  console.log(`Deploying UnitFlow from ${deployer.address} on ${arcNetwork.name}...`);
  const factory = await deploy("UnitFlowV25Factory", [deployer.address]);
  const constructorArgs = [factory.address, ARC_USDC];
  const liquidityRouter = await deploy("UnitFlowV25LiquidityRouter", constructorArgs);
  const swapRouter = await deploy("UnitFlowV25SwapRouter", constructorArgs);

  const bindings = await Promise.all([
    liquidityRouter.contract.factory(), liquidityRouter.contract.USDC(),
    swapRouter.contract.factory(), swapRouter.contract.USDC(),
  ]);
  if (
    bindings[0] !== factory.address || bindings[1] !== ARC_USDC ||
    bindings[2] !== factory.address || bindings[3] !== ARC_USDC
  ) {
    throw new Error("Deployed router bindings do not match the factory and Arc USDC");
  }

  const result = {
    chainId: network.chainId.toString(),
    network: arcNetwork.name,
    deployer: deployer.address,
    usdc: ARC_USDC,
    factory: { address: factory.address, transactionHash: factory.transactionHash },
    liquidityRouter: {
      address: liquidityRouter.address,
      transactionHash: liquidityRouter.transactionHash,
    },
    swapRouter: { address: swapRouter.address, transactionHash: swapRouter.transactionHash },
  };

  console.log("UnitFlow deployment complete and router bindings verified:");
  console.log(JSON.stringify(result, null, 2));
  console.log("\nExplorer links:");
  console.log(`${arcNetwork.explorer}/address/${factory.address}`);
  console.log(`${arcNetwork.explorer}/address/${liquidityRouter.address}`);
  console.log(`${arcNetwork.explorer}/address/${swapRouter.address}`);
  console.log("\nFrontend environment values:");
  console.log(`NEXT_PUBLIC_FACTORY_CONTRACT=${factory.address}`);
  console.log(`NEXT_PUBLIC_LIQUIDITY_ROUTER=${liquidityRouter.address}`);
  console.log(`NEXT_PUBLIC_ROUTER_CONTRACT=${swapRouter.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
