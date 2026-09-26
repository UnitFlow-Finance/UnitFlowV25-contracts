const hre = require("hardhat");

async function main() {
  const ethers = hre.ethers;

  console.log("🚀 Deploying UnitFlowV25Factory...");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance));

  // The deployer will usually be the feeToSetter
  const feeToSetter = deployer.address;
  console.log("\n📌 feeToSetter:", feeToSetter);

  console.log("\n⏳ Deploying UnitFlowV25Factory contract...");
  const Factory = await ethers.getContractFactory("UnitFlowV25Factory");

  const factory = await Factory.deploy(feeToSetter);
  await factory.waitForDeployment();

  const contractAddress = await factory.getAddress();

  console.log("\n✅ UnitFlowV25Factory deployed successfully!");
  console.log("Contract address:", contractAddress);
  console.log("Transaction hash:", factory.deploymentTransaction()?.hash);

  console.log("\n🔍 View on explorer:");
  console.log(`https://testnet.arcscan.app/address/${contractAddress}`);

  console.log("\n📝 Save to your .env.local:");
  console.log(`NEXT_PUBLIC_FACTORY_CONTRACT=${contractAddress}`);

  console.log("\n⏳ Waiting for confirmations...");
  await factory.deploymentTransaction()?.wait(5);

  console.log("\n🎉 Deployment confirmed!");

  console.log("\n📌 Verify with:");
  console.log(
    `npx hardhat verify --network arcTestnet ${contractAddress} "${feeToSetter}"`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
