const hre = require("hardhat");

async function main() {
  const ethers = hre.ethers;

  console.log("🚀 Deploying ArcFlowV25SwapRouter...");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Native USDC balance:", ethers.formatEther(balance));

  const FACTORY_ADDRESS = ethers.getAddress(process.env.FACTORY_ADDRESS);
  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

  console.log("Using Factory:", FACTORY_ADDRESS);
  console.log("Using Arc USDC:", USDC_ADDRESS);

  console.log("\n⏳ Deploying router...");
  const Router = await ethers.getContractFactory("ArcFlowV25SwapRouter");
  const router = await Router.deploy(FACTORY_ADDRESS, USDC_ADDRESS);

  await router.waitForDeployment();
  const routerAddress = await router.getAddress();

  console.log("\n✅ ArcFlowV25SwapRouter deployed successfully!");
  console.log("Router address:", routerAddress);
  console.log("Transaction:", router.deploymentTransaction()?.hash);

  console.log("\n🔍 View on explorer:");
  console.log(`https://testnet.arcscan.app/address/${routerAddress}`);

  console.log("\n📝 Add to .env:");
  console.log(`NEXT_PUBLIC_ROUTER_CONTRACT=${routerAddress}`);

  console.log("\n⏳ Waiting for confirmations...");
  await router.deploymentTransaction()?.wait(5);

  console.log("\n🎉 Router deployment confirmed!");

  console.log("\n📌 Verify with:");
  console.log(
    `npx hardhat verify --network arcTestnet ${routerAddress} "${FACTORY_ADDRESS}" "${USDC_ADDRESS}"`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
