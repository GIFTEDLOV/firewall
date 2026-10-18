// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Safe transaction hooks (ABI-compatible with Safe 1.3+).
interface IFirewallTransactionGuard {
    enum Operation { Call, DelegateCall }
    function checkTransaction(
        address to, uint256 value, bytes memory data, Operation operation,
        uint256 safeTxGas, uint256 baseGas, uint256 gasPrice,
        address gasToken, address payable refundReceiver,
        bytes memory signatures, address msgSender
    ) external;
    function checkAfterExecution(bytes32 txHash, bool success) external;
}

interface IFirewallSafeNonce {
    function nonce() external view returns (uint256);
}

/**
 * @notice Testnet prospective Safe Guard. Separate from the GenLayer V2
 * historical-evidence contract: a V2 historical permit MUST NOT authorize a
 * new EVM transaction.
 *
 * Security boundary: an explicitly trusted attestor signs a typed digest only
 * after independent verification of the finalized *prospective* GenLayer
 * permit. This contract validates the attestor signature and binds chain,
 * Guard, Safe, Safe nonce, destination, value, calldata, operation and expiry.
 * It does NOT itself verify GenLayer consensus on EVM. Deployment MUST remain
 * blocked until the prospective GenLayer bridge and signer are qualified.
 *
 * Safe owner-transaction Guard only; modules have separate authorization
 * semantics. Qualification Safes must have no enabled bypass modules.
 */
contract FirewallSafeGuard is IFirewallTransactionGuard {
    error UnauthorizedSafe();
    error InvalidPermit();
    error InvalidSignature();
    error UnauthorizedExecution();
    error PermitExpired();
    error InvalidOperation();
    error NoPendingExecution();

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant PERMIT_TYPEHASH =
        keccak256("ProspectivePermit(address safe,uint256 nonce,address target,uint256 value,bytes32 calldataHash,uint8 operation,uint64 expiresAt,bytes32 genlayerPermitHash,bytes32 intentId)");
    bytes32 private constant NAME_HASH = keccak256("FirewallSafeGuard");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1_N_DIV_2 =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public immutable safe;
    address public immutable attestor;

    struct ProspectivePermit {
        uint256 nonce;
        address target;
        uint256 value;
        bytes32 calldataHash;
        uint8 operation;
        uint64 expiresAt;
        bytes32 genlayerPermitHash;
        bytes32 intentId;
    }

    struct ActivePermit {
        bytes32 typedDigest;
        bytes32 intentId;
        uint64 expiresAt;
        bool active;
    }

    mapping(uint256 => ActivePermit) public permits;
    mapping(bytes32 => bool) public usedIntentIds;
    bool private pending;
    uint256 private pendingNonce;

    event ProspectivePermitPublished(uint256 indexed nonce, bytes32 indexed intentId, bytes32 indexed typedDigest);
    event GuardPermitted(uint256 indexed nonce, bytes32 indexed intentId);
    event GuardExecutionRecorded(uint256 indexed nonce, bytes32 indexed safeTxHash, bool success);

    constructor(address safe_, address attestor_) {
        if (safe_ == address(0) || safe_.code.length == 0 || attestor_ == address(0)) revert InvalidPermit();
        safe = safe_;
        attestor = attestor_;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IFirewallTransactionGuard).interfaceId || interfaceId == 0x01ffc9a7;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function digest(ProspectivePermit memory p) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            PERMIT_TYPEHASH, safe, p.nonce, p.target, p.value,
            p.calldataHash, p.operation, p.expiresAt,
            p.genlayerPermitHash, p.intentId
        ));
        return keccak256(abi.encodePacked(hex"1901", domainSeparator(), structHash));
    }

    function checkTransaction(
        address to, uint256 value, bytes memory data, Operation operation,
        uint256, uint256, uint256, address, address payable, bytes memory, address
    ) external override {
        if (msg.sender != safe) revert UnauthorizedSafe();
        if (operation != Operation.Call) revert InvalidOperation();
        // Safe.execTransaction increments nonce BEFORE entering its guard.
        uint256 current = IFirewallSafeNonce(safe).nonce();
        if (current == 0) revert UnauthorizedExecution();
        uint256 consumedNonce = current - 1;
        ActivePermit storage saved = permits[consumedNonce];
        if (!saved.active) revert UnauthorizedExecution();
        if (block.timestamp >= saved.expiresAt) revert PermitExpired();

        // The full original permit is verified at publication, including
        // transaction inputs. Call binding is stored separately at publish.
        if (saved.typedDigest == bytes32(0) || !_matchesAuthorizedCall(consumedNonce, to, value, data, operation)) revert UnauthorizedExecution();
        if (usedIntentIds[saved.intentId] || pending) revert UnauthorizedExecution();

        pending = true;
        pendingNonce = consumedNonce;
        usedIntentIds[saved.intentId] = true;
        saved.active = false;
        emit GuardPermitted(consumedNonce, saved.intentId);
    }

    mapping(uint256 => bytes32) private _callBinding;

    function _matchesAuthorizedCall(
        uint256 n, address to, uint256 value, bytes memory data, Operation operation
    ) internal view returns (bool) {
        return keccak256(abi.encode(
            block.chainid, safe, n, to, value, keccak256(data), uint8(operation)
        )) == _callBinding[n];
    }



    function publishBoundPermit(ProspectivePermit calldata p, bytes calldata signature) external {
        // This is the deployment-qualified publication route; avoid an
        // alternative route that omits transaction binding.
        if (p.nonce != IFirewallSafeNonce(safe).nonce()
            || p.expiresAt <= block.timestamp || p.intentId == bytes32(0)
            || p.genlayerPermitHash == bytes32(0) || p.target == address(0)
            || p.operation != uint8(Operation.Call) || permits[p.nonce].active
            || usedIntentIds[p.intentId]) revert InvalidPermit();
        bytes32 typedDigest = digest(p);
        if (_recover(typedDigest, signature) != attestor) revert InvalidSignature();
        permits[p.nonce] = ActivePermit(typedDigest, p.intentId, p.expiresAt, true);
        _callBinding[p.nonce] = keccak256(abi.encode(
            block.chainid, safe, p.nonce, p.target, p.value, p.calldataHash, p.operation
        ));
        emit ProspectivePermitPublished(p.nonce, p.intentId, typedDigest);
    }

    function checkAfterExecution(bytes32 txHash, bool success) external override {
        if (msg.sender != safe) revert UnauthorizedSafe();
        if (!pending) revert NoPendingExecution();
        uint256 n = pendingNonce;
        pending = false;
        delete pendingNonce;
        emit GuardExecutionRecorded(n, txHash, success);
    }

    function _recover(bytes32 typedDigest, bytes calldata signature) internal pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v != 27 && v != 28) revert InvalidSignature();
        if (uint256(s) > SECP256K1_N_DIV_2 || uint256(s) == 0 || r == bytes32(0)) revert InvalidSignature();
        signer = ecrecover(typedDigest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}