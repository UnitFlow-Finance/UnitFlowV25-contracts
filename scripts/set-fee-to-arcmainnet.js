const hre = require("hardhat");

const ARC_MAINNET_CHAIN_ID = 5042n;
const FACTORY_ADDRESS = "0xFc1EC6761e246D5cb0c4C22669f8635098B22ba1";

async function main() {
  const { ethers } = hre;
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== ARC_MAINNET_CHAIN_ID) {
    throw new Error(
      `Expected Arc mainnet chain ${ARC_MAINNET_CHAIN_ID}, received ${network.chainId}`,
    );
  }
  if (process.env.CONFIRM_ARC_MAINNET_FEE_TO !== "1") {
    throw new Error(
      "Arc mainnet fee update is locked. Set CONFIRM_ARC_MAINNET_FEE_TO=1 to authorize it.",
    );
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("MAINNET_PRIVATE_KEY is required");

  const code = await ethers.provider.getCode(FACTORY_ADDRESS);
  if (code === "0x") throw new Error(`No factory contract exists at ${FACTORY_ADDRESS}`);

  const factory = await ethers.getContractAt("UnitFlowV25Factory", FACTORY_ADDRESS, deployer);
  const [feeTo, feeToSetter] = await Promise.all([
    factory.feeTo(),
    factory.feeToSetter(),
  ]);

  if (feeToSetter !== deployer.address) {
    throw new Error(
      `Connected deployer ${deployer.address} is not feeToSetter ${feeToSetter}`,
    );
  }
  if (feeTo === deployer.address) {
    console.log(`feeTo is already set to deployer ${deployer.address}; no transaction sent.`);
    return;
  }

  console.log(`Factory: ${FACTORY_ADDRESS}`);
  console.log(`Current feeTo: ${feeTo}`);
  console.log(`Setting feeTo to deployer: ${deployer.address}`);

  const transaction = await factory.setFeeTo(deployer.address);
  console.log(`Transaction submitted: ${transaction.hash}`);
  await transaction.wait();

  const updatedFeeTo = await factory.feeTo();
  if (updatedFeeTo !== deployer.address) {
    throw new Error(`feeTo verification failed: received ${updatedFeeTo}`);
  }

  console.log(`feeTo updated and verified: ${updatedFeeTo}`);
  console.log(`Explorer: https://arc-scan.org/tx/${transaction.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
