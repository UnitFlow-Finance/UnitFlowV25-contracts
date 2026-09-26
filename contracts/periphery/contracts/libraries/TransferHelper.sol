// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.6.0;

// helper methods for interacting with ERC20 tokens that do not consistently return true/false
library TransferHelper {
    function safeApprove(
    address token,
    address spender,
    uint256 value
) internal {
    (bool success, bytes memory data) = token.call(
        abi.encodeWithSelector(0x095ea7b3, spender, value)
    );

    // First ensure the call itself succeeded
    require(success, "TransferHelper::approve failed");

    // If data is returned, it must decode to true
    if (data.length > 0) {
        require(abi.decode(data, (bool)), "TransferHelper::approve returned false");
    }
}

    function safeTransfer(
    address token,
    address to,
    uint256 value
) internal {
    (bool success, bytes memory data) = token.call(
        abi.encodeWithSelector(0xa9059cbb, to, value)
    );

    // First ensure the call itself succeeded
    require(success, "TransferHelper::transfer failed");

    // If data is returned, it must decode to true
    if (data.length > 0) {
        require(abi.decode(data, (bool)), "TransferHelper::transfer returned false");
    }
}

    function safeTransferFrom(
    address token,
    address from,
    address to,
    uint256 value
) internal {
    (bool success, bytes memory data) = token.call(
        abi.encodeWithSelector(0x23b872dd, from, to, value)
    );

    // If the call itself failed, revert immediately
    require(success, "TransferHelper::transferFrom failed");

    // If data is returned, it must either be empty or decode to true
    if (data.length > 0) {
        // Some tokens return non-boolean data; check carefully
        require(abi.decode(data, (bool)), "TransferHelper::transferFrom returned false");
    }
}
}
