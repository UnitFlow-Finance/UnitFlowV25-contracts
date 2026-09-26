pragma solidity >=0.5.0;

interface IUnitFlowV25Migrator {
    function migrate(address token, uint amountTokenMin, uint amountUSDCMin, address to, uint deadline) external;
}
