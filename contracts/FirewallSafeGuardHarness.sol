// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface HarnessGuard {
    function checkTransaction(address, uint256, bytes calldata, uint8, uint256, uint256, uint256, address, address payable, bytes calldata, address) external;
    function checkAfterExecution(bytes32, bool) external;
    function checkModuleTransaction(address, uint256, bytes calldata, uint8, address) external;
}

contract FirewallMockSafe {
    address public immutable owner;
    address public guard;
    uint256 public nonce;

    constructor(address owner_) { owner = owner_; }

    function setGuard(address guard_) external { require(msg.sender == owner, "OWNER_ONLY"); guard = guard_; }

    function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation) external returns (bool success) {
        require(msg.sender == owner, "OWNER_ONLY");
        if (guard != address(0)) HarnessGuard(guard).checkTransaction(to, value, data, operation, 0, 0, 0, address(0), payable(address(0)), hex"", msg.sender);
        uint256 currentNonce = nonce;
        nonce = currentNonce + 1;
        if (operation == 0) (success,) = to.call{value: value}(data);
        else (success,) = to.delegatecall(data);
        if (guard != address(0)) HarnessGuard(guard).checkAfterExecution(keccak256(abi.encode(block.chainid, address(this), to, value, keccak256(data), operation, currentNonce)), success);
        require(success, "TARGET_CALL_FAILED");
    }

    function execTransactionFromModule(address to, uint256 value, bytes calldata data, uint8 operation) external returns (bool success) {
        if (guard != address(0)) HarnessGuard(guard).checkModuleTransaction(to, value, data, operation, msg.sender);
        if (operation == 0) (success,) = to.call{value: value}(data);
        else (success,) = to.delegatecall(data);
    }

    receive() external payable {}
}

contract FirewallGuardReceiver {
    uint256 public value;
    event ValueSet(uint256 value);
    function setValue(uint256 next) external { value = next; emit ValueSet(next); }
}
