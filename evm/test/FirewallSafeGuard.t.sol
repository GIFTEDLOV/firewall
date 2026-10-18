// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../src/FirewallSafeGuard.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8, bytes32, bytes32);
    function warp(uint256 timestamp) external;
}

contract TestSafe {
    uint256 public nonce;
    FirewallSafeGuard public guard;

    function setGuard(FirewallSafeGuard next) external { guard = next; }

    function execute(address to, uint256 value, bytes memory data, uint8 operation) external {
        nonce += 1; // Safe increments nonce before calling checkTransaction
        guard.checkTransaction(to, value, data, IFirewallTransactionGuard.Operation(operation),
            0, 0, 0, address(0), payable(address(0)), "", msg.sender);
        guard.checkAfterExecution(keccak256(abi.encode(to, value, data, operation)), true);
    }
}

contract FirewallSafeGuardTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant ATTESTOR_KEY = 0xA11CE;
    uint256 private constant WRONG_KEY = 0xB0B;
    TestSafe private safe;
    FirewallSafeGuard private guard;

    function setUp() public {
        safe = new TestSafe();
        guard = new FirewallSafeGuard(address(safe), vm.addr(ATTESTOR_KEY));
        safe.setGuard(guard);
    }

    function _permit() private view returns (FirewallSafeGuard.ProspectivePermit memory p) {
        p = FirewallSafeGuard.ProspectivePermit({
            nonce: safe.nonce(),
            target: address(0xBEEF),
            value: 0,
            calldataHash: keccak256(hex"1234"),
            operation: 0,
            expiresAt: uint64(block.timestamp + 3600),
            genlayerPermitHash: bytes32(uint256(0x1111)),
            intentId: keccak256("unique-v3-intent")
        });
    }

    function _sign(FirewallSafeGuard g, FirewallSafeGuard.ProspectivePermit memory p, uint256 key)
        private returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, g.digest(p));
        return abi.encodePacked(r, s, v);
    }

    function _publish(FirewallSafeGuard.ProspectivePermit memory p) private {
        guard.publishBoundPermit(p, _sign(guard, p, ATTESTOR_KEY));
    }

    function testPermitRequired() public {
        try safe.execute(address(0xBEEF), 0, hex"1234", 0) {
            revert("unguarded execution unexpectedly succeeded");
        } catch {}
        require(safe.nonce() == 0, "unauthorized call advanced nonce");
    }

    function testAuthorizedTransactionAndConsumption() public {
        FirewallSafeGuard.ProspectivePermit memory p = _permit();
        _publish(p);
        safe.execute(p.target, p.value, hex"1234", p.operation);
        require(safe.nonce() == 1, "Safe nonce");
        require(guard.usedIntentIds(p.intentId), "intent was not consumed");
        (,,,bool active) = guard.permits(0);
        require(!active, "permit remained active");
    }

    function testWrongTargetRejected() public {
        _publish(_permit());
        try safe.execute(address(0xCAFE), 0, hex"1234", 0) {
            revert("wrong target was permitted");
        } catch {}
        require(safe.nonce() == 0, "nonce changed on revert");
    }

    function testWrongCalldataRejected() public {
        _publish(_permit());
        try safe.execute(address(0xBEEF), 0, hex"9999", 0) {
            revert("wrong calldata was permitted");
        } catch {}
    }

    function testReplayRejected() public {
        FirewallSafeGuard.ProspectivePermit memory p = _permit();
        _publish(p);
        safe.execute(p.target, p.value, hex"1234", 0);
        try safe.execute(p.target, p.value, hex"1234", 0) {
            revert("replay was permitted");
        } catch {}
        require(safe.nonce() == 1, "replay changed nonce");
    }

    function testExpiredPermitRejected() public {
        FirewallSafeGuard.ProspectivePermit memory p = _permit();
        p.expiresAt = uint64(block.timestamp + 1);
        _publish(p);
        vm.warp(block.timestamp + 2);
        try safe.execute(p.target, p.value, hex"1234", 0) {
            revert("expired permit was permitted");
        } catch {}
    }

    function testForgedAttestorSignatureRejected() public {
        FirewallSafeGuard.ProspectivePermit memory p = _permit();
        try guard.publishBoundPermit(p, _sign(guard, p, WRONG_KEY)) {
            revert("forged permit accepted");
        } catch {}
    }

    function testGuardDomainSeparation() public {
        FirewallSafeGuard.ProspectivePermit memory p = _permit();
        FirewallSafeGuard other = new FirewallSafeGuard(address(safe), vm.addr(ATTESTOR_KEY));
        try other.publishBoundPermit(p, _sign(guard, p, ATTESTOR_KEY)) {
            revert("signature valid on a different Guard");
        } catch {}
    }

    function testDelegateCallRejected() public {
        _publish(_permit());
        try safe.execute(address(0xBEEF), 0, hex"1234", 1) {
            revert("delegatecall was permitted");
        } catch {}
    }

    function testGuardCannotBeCalledByThirdParty() public {
        try guard.checkTransaction(address(0xBEEF), 0, hex"1234",
            IFirewallTransactionGuard.Operation.Call,
            0, 0, 0, address(0), payable(address(0)), "", address(this)) {
            revert("unauthorized caller was permitted");
        } catch {}
    }

    function testAfterExecutionRequiresPriorCheck() public {
        try guard.checkAfterExecution(0x0, true) {
            revert("afterExecution without prior hook accepted");
        } catch {}
    }
}
