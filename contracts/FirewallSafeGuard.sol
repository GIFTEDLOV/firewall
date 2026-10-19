// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISafeTransactionGuard {
    function checkTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes calldata signatures, address msgSender) external;
    function checkAfterExecution(bytes32 txHash, bool success) external;
}

interface ISafeNonce { function nonce() external view returns (uint256); }

/**
 * Safe-compatible execution gate for a signed, canonical-permit relay.
 *
 * The relay signer is an explicit trust boundary: it must authenticate the
 * canonical GenLayer permit before submitting registerAuthorization. The Safe
 * never trusts a frontend boolean or a proposer signature. Every authorization
 * is keyed by the Safe's current nonce and the exact target/value/calldata/
 * operation tuple, and is consumed before the call is made.
 */
contract FirewallSafeGuard is ISafeTransactionGuard {
    bytes4 private constant ERC165_INTERFACE_ID = 0x01ffc9a7;
    bytes32 public constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant AUTH_TYPEHASH = keccak256("PermitAuthorization(bytes32 permitId,bytes32 intentId,bytes32 mandateId,bytes32 executionId,bytes32 proposalHash,bytes32 executionBundleHash,uint256 targetChainId,address safe,address to,uint256 value,bytes32 dataHash,uint8 operation,uint256 safeNonce,bytes32 targetsDigest,bytes32 valuesDigest,bytes32 calldataDigest,bytes32 codeFactsDigest,bytes32 implementationFactsDigest,bytes32 targetCodeHash,address implementationAddress,bytes32 implementationCodeHash,bytes32 batchStructureHash,bytes32 adjudicationId,uint256 adjudicationGeneration,uint256 executionDeadline,uint256 expiresAt,bytes32 canonicalPermitHash)");

    struct Authorization {
        bytes32 permitId;
        bytes32 intentId;
        bytes32 mandateId;
        bytes32 executionId;
        bytes32 proposalHash;
        bytes32 executionBundleHash;
        uint256 targetChainId;
        address safe;
        address to;
        uint256 value;
        bytes32 dataHash;
        uint8 operation;
        uint256 safeNonce;
        bytes32 targetsDigest;
        bytes32 valuesDigest;
        bytes32 calldataDigest;
        bytes32 codeFactsDigest;
        bytes32 implementationFactsDigest;
        bytes32 targetCodeHash;
        address implementationAddress;
        bytes32 implementationCodeHash;
        bytes32 batchStructureHash;
        bytes32 adjudicationId;
        uint256 adjudicationGeneration;
        uint256 executionDeadline;
        uint256 expiresAt;
        bytes32 canonicalPermitHash;
    }

    address public immutable safe;
    address public owner;
    mapping(address => bool) public authorizedRelayer;
    mapping(bytes32 => Authorization) public authorizations;
    mapping(bytes32 => bool) public permitRegistered;
    mapping(bytes32 => bool) public intentRegistered;
    mapping(bytes32 => bool) public consumed;
    mapping(bytes32 => bool) public revoked;

    error CallerNotSafe();
    error UnauthorizedRelayer();
    error InvalidSignature();
    error AuthorizationMissing();
    error AuthorizationMismatch();
    error AuthorizationExpired();
    error AuthorizationAlreadyConsumed();
    error CodeIdentityMismatch();
    error DelegateCallNotAllowed();
    error ModuleExecutionBlocked();
    error GuardConfigurationChange();
    error ProtectedExecutionFailed();
    error OnlyOwner();

    event AuthorizationRegistered(bytes32 indexed permitId, bytes32 indexed intentId, bytes32 indexed executionBundleHash, uint256 safeNonce, uint256 executionDeadline, uint256 expiresAt, address signer);
    event AuthorizationConsumedEvent(bytes32 indexed permitId, bytes32 indexed executionBundleHash, bytes32 indexed txHash);
    event RelayerUpdated(address indexed relayer, bool allowed);
    event PermitRevoked(bytes32 indexed permitId);

    constructor(address safe_, address relayer_) {
        require(safe_ != address(0) && relayer_ != address(0), "ZERO_ADDRESS");
        safe = safe_;
        owner = msg.sender;
        authorizedRelayer[relayer_] = true;
        emit RelayerUpdated(relayer_, true);
    }

    modifier onlyOwner() { if (msg.sender != owner) revert OnlyOwner(); _; }

    function setRelayer(address relayer, bool allowed) external onlyOwner {
        require(relayer != address(0), "ZERO_ADDRESS");
        authorizedRelayer[relayer] = allowed;
        emit RelayerUpdated(relayer, allowed);
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        require(nextOwner != address(0), "ZERO_ADDRESS");
        owner = nextOwner;
    }

    function revokePermit(bytes32 permitId) external onlyOwner {
        revoked[permitId] = true;
        emit PermitRevoked(permitId);
    }

    function registerAuthorization(Authorization calldata authorization, bytes calldata signature) external {
        if (authorization.safe != safe || authorization.targetChainId != block.chainid || authorization.permitId == bytes32(0) || authorization.intentId == bytes32(0) || authorization.canonicalPermitHash == bytes32(0) || permitRegistered[authorization.permitId] || intentRegistered[authorization.intentId]) revert AuthorizationMismatch();
        if (authorization.executionDeadline <= block.timestamp || authorization.expiresAt <= block.timestamp || authorization.executionDeadline > authorization.expiresAt) revert AuthorizationExpired();
        // This generic guard has no safe, in-contract EIP-1967 reader. A proxy
        // authorization must therefore be rejected before it can be relayed;
        // a future target-specific verifier may provide a separate integration.
        if (authorization.implementationAddress != address(0)) revert CodeIdentityMismatch();
        address signer = _recover(_digest(authorization), signature);
        if (!authorizedRelayer[signer]) revert UnauthorizedRelayer();
        bytes32 key = _executionKey(authorization.targetChainId, authorization.safe, authorization.to, authorization.value, authorization.dataHash, authorization.operation, authorization.safeNonce);
        if (authorizations[key].permitId != bytes32(0)) revert AuthorizationMismatch();
        authorizations[key] = authorization;
        permitRegistered[authorization.permitId] = true;
        intentRegistered[authorization.intentId] = true;
        emit AuthorizationRegistered(authorization.permitId, authorization.intentId, authorization.executionBundleHash, authorization.safeNonce, authorization.executionDeadline, authorization.expiresAt, signer);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(ISafeTransactionGuard).interfaceId || interfaceId == ERC165_INTERFACE_ID;
    }

    function checkTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256, uint256, uint256, address, address payable, bytes calldata, address) external override {
        if (msg.sender != safe) revert CallerNotSafe();
        _check(to, value, data, operation);
    }

    function checkModuleTransaction(address, uint256, bytes calldata, uint8, address) external view {
        // Safe versions that expose the module hook are fail-closed. Older
        // Safe versions do not call this hook; their module execution must be
        // disabled or a separate module guard must be installed.
        revert ModuleExecutionBlocked();
    }

    function checkAfterExecution(bytes32, bool success) external override {
        if (msg.sender != safe) revert CallerNotSafe();
        if (!success) revert ProtectedExecutionFailed();
    }

    function _check(address to, uint256 value, bytes calldata data, uint8 operation) internal {
        if (operation != 0) revert DelegateCallNotAllowed();
        // Configuration changes stay fail-closed. The only exception is an
        // exact Safe self-call that removes this Guard; it still has to match
        // a fresh, signed authorization below. This keeps the Safe recoverable
        // without creating an owner-only bypass around canonical permits.
        if (to == safe && _isGuardConfigurationCall(data) && !_isAuthorizedGuardRemoval(data)) revert GuardConfigurationChange();
        // Safe's execTransaction performs `nonce++` before invoking the guard.
        // Bind to the nonce signed and supplied by the relay, which is the
        // current stored nonce minus the just-consumed transaction nonce.
        uint256 currentSafeNonce = ISafeNonce(safe).nonce();
        if (currentSafeNonce == 0) revert AuthorizationMismatch();
        uint256 safeNonce = currentSafeNonce - 1;
        bytes32 dataHash = keccak256(data);
        bytes32 key = _executionKey(block.chainid, safe, to, value, dataHash, operation, safeNonce);
        Authorization memory authorization = authorizations[key];
        if (authorization.permitId == bytes32(0)) revert AuthorizationMissing();
        if (revoked[authorization.permitId] || consumed[authorization.permitId]) revert AuthorizationAlreadyConsumed();
        if (authorization.executionDeadline < block.timestamp || authorization.expiresAt <= block.timestamp) revert AuthorizationExpired();
        if (authorization.targetChainId != block.chainid || authorization.safe != safe || authorization.to != to || authorization.value != value || authorization.dataHash != dataHash || authorization.operation != operation || authorization.safeNonce != safeNonce) revert AuthorizationMismatch();
        if (authorization.targetCodeHash != bytes32(0) && authorization.targetCodeHash != _codeHash(to)) revert CodeIdentityMismatch();
        // A generic guard cannot read another contract's EIP-1967 storage
        // slot. This first integration therefore rejects proxy authorizations
        // instead of trusting a signed implementation address.
        if (authorization.implementationAddress != address(0)) revert CodeIdentityMismatch();
        // Mark before the external call. A reverting Safe transaction reverts
        // this write; a successful call cannot be replayed with the same nonce.
        consumed[authorization.permitId] = true;
        emit AuthorizationConsumedEvent(authorization.permitId, authorization.executionBundleHash, keccak256(abi.encode(block.chainid, safe, to, value, dataHash, operation, safeNonce)));
    }

    function _isGuardConfigurationCall(bytes calldata data) internal pure returns (bool) {
        if (data.length < 4) return false;
        bytes4 selector;
        assembly { selector := calldataload(data.offset) }
        return selector == bytes4(keccak256("setGuard(address)")) || selector == bytes4(keccak256("enableModule(address)")) || selector == bytes4(keccak256("disableModule(address)")) || selector == bytes4(keccak256("execTransactionFromModule(address,uint256,bytes,uint8)"));
    }

    function _isAuthorizedGuardRemoval(bytes calldata data) internal pure returns (bool) {
        if (data.length != 36) return false;
        bytes4 selector;
        assembly { selector := calldataload(data.offset) }
        if (selector != bytes4(keccak256("setGuard(address)"))) return false;
        return abi.decode(data[4:], (address)) == address(0);
    }

    function _executionKey(uint256 chainId, address safe_, address to, uint256 value, bytes32 dataHash, uint8 operation, uint256 safeNonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(chainId, safe_, to, value, dataHash, operation, safeNonce));
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes("FirewallSafeGuard")), keccak256(bytes("1")), block.chainid, address(this)));
    }

    function _structHash(Authorization calldata a) internal pure returns (bytes32) {
        return keccak256(abi.encode(AUTH_TYPEHASH, a.permitId, a.intentId, a.mandateId, a.executionId, a.proposalHash, a.executionBundleHash, a.targetChainId, a.safe, a.to, a.value, a.dataHash, a.operation, a.safeNonce, a.targetsDigest, a.valuesDigest, a.calldataDigest, a.codeFactsDigest, a.implementationFactsDigest, a.targetCodeHash, a.implementationAddress, a.implementationCodeHash, a.batchStructureHash, a.adjudicationId, a.adjudicationGeneration, a.executionDeadline, a.expiresAt, a.canonicalPermitHash));
    }

    function _digest(Authorization calldata a) internal view returns (bytes32) { return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), _structHash(a))); }
    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(signature.offset) s := calldataload(add(signature.offset, 32)) v := byte(0, calldataload(add(signature.offset, 64))) }
        if (v < 27) v += 27;
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }

    function _codeHash(address target) internal view returns (bytes32 result) { assembly { result := extcodehash(target) } }
}
