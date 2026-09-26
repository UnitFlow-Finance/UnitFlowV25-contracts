const hre = require("hardhat");

async function main() {
  const ethers = hre.ethers;

  console.log("🚀 Deploying USDC (ERC20, 6 decimals)...");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH\n");

  // Initial supply, e.g. 1,000,000 USDC (with 6 decimals = 1000000 * 10**6)
  const initialSupply = ethers.parseUnits("1000000", 6);

  console.log("Deploying USDC contract...");
  const USDC = await ethers.getContractFactory("USDC");
  const usdc = await USDC.deploy(initialSupply);
  await usdc.waitForDeployment();

  const usdcAddress = await usdc.getAddress();

  console.log("\n✅ USDC deployed successfully!");
  console.log("Contract address:", usdcAddress);
  console.log("Transaction hash:", usdc.deploymentTransaction()?.hash);

  console.log("\n🔍 View on explorer:");
  console.log(`https://testnet.arcscan.app/address/${usdcAddress}`);

  console.log("\n📝 Add to your .env.local:");
  console.log(`NEXT_PUBLIC_USDC_CONTRACT=${usdcAddress}`);

  console.log("\n⏳ Waiting for confirmations...");
  await usdc.deploymentTransaction()?.wait(5);

  console.log("\n🎉 Deployment confirmed!");

  console.log("\n📌 Verify with:");
  console.log(
    `npx hardhat verify --network arcTestnet ${usdcAddress} "${initialSupply.toString()}"`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
