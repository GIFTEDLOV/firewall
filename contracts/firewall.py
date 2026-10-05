# { "Depends": "py-genlayer:9b8kjyda2ycxyq4ea6g4yfpnydxhd52gqba5rb8dw7krkh5mn9p0" }
from dataclasses import dataclass

import genlayer as gl
from genlayer.storage import DynArray, allow as allow_storage
from genlayer.types import Address, u256


SEMANTIC_SCHEMA = "FIREWALL_MANDATE_V1"


@allow_storage
@dataclass
class MandateRecord:
    mandate_id: str
    governance_chain_id: u256
    proposal_hash: bytes
    proposal_text_sha256: bytes
    mandate_version: u256
    mandate_digest: bytes
    state: str
    frozen_at: u256


@allow_storage
@dataclass
class ExecutionRecord:
    execution_id: str
    mandate_id: str
    chain_id: u256
    bundle_hash: bytes
    targets_digest: bytes
    calldata_value_digest: bytes
    code_facts_digest: bytes
    state: str
    evidence_hash: bytes
    generation: u256


@allow_storage
@dataclass
class AdjudicationRecord:
    adjudication_id: str
    execution_id: str
    evidence_hash: bytes
    generation: u256
    semantic_schema: str
    intent_satisfied: bool
    scope_expanded: bool
    prohibited_effect_present: bool
    economic_terms_consistent: bool
    administrative_authority_changed: bool
    implementation_behavior_consistent: bool
    evidence_sufficient: bool
    verdict: str
    created_at: u256


@allow_storage
@dataclass
class PermitRecord:
    permit_id: str
    mandate_id: str
    mandate_version: u256
    proposal_hash: bytes
    execution_id: str
    execution_bundle_hash: bytes
    chain_id: u256
    targets_digest: bytes
    calldata_value_digest: bytes
    code_facts_digest: bytes
    adjudication_id: str
    adjudication_generation: u256
    semantic_schema: str
    issued_at: u256
    expires_at: u256
    permit_binding_hash: bytes
    status: str


class Firewall(gl.contract.Contract):
    owner: Address
    next_mandate_number: u256
    next_execution_number: u256
    next_adjudication_number: u256
    next_permit_number: u256
    mandates: gl.storage.DynArray[MandateRecord]
    executions: gl.storage.DynArray[ExecutionRecord]
    adjudications: gl.storage.DynArray[AdjudicationRecord]
    permits: gl.storage.DynArray[PermitRecord]

    def __init__(self):
        self.owner = gl.message.sender_address
        self.next_mandate_number = u256(1)
        self.next_execution_number = u256(1)
        self.next_adjudication_number = u256(1)
        self.next_permit_number = u256(1)

    def _only_owner(self):
        assert gl.message.sender_address == self.owner

    def _id(self, prefix: str, number: u256) -> str:
        return prefix + "-" + str(number).zfill(8)

    def _find_mandate(self, mandate_id: str) -> MandateRecord:
        for mandate in self.mandates:
            if mandate.mandate_id == mandate_id:
                return mandate
        assert False
        return self.mandates[0]

    def _find_execution(self, execution_id: str) -> ExecutionRecord:
        for execution in self.executions:
            if execution.execution_id == execution_id:
                return execution
        assert False
        return self.executions[0]

    def _find_adjudication(self, adjudication_id: str) -> AdjudicationRecord:
        for adjudication in self.adjudications:
            if adjudication.adjudication_id == adjudication_id:
                return adjudication
        assert False
        return self.adjudications[0]

    def _derive_verdict(
        self,
        intent_satisfied: bool,
        scope_expanded: bool,
        prohibited_effect_present: bool,
        economic_terms_consistent: bool,
        administrative_authority_changed: bool,
        implementation_behavior_consistent: bool,
        evidence_sufficient: bool,
    ) -> str:
        if not evidence_sufficient:
            return "INCONCLUSIVE"
        if (
            intent_satisfied
            and not scope_expanded
            and not prohibited_effect_present
            and economic_terms_consistent
            and not administrative_authority_changed
            and implementation_behavior_consistent
        ):
            return "EXECUTION_PERMITTED"
        return "EXECUTION_BLOCKED"

    @gl.public.view
    def get_semantic_schema(self) -> str:
        return SEMANTIC_SCHEMA

    @gl.public.view
    def get_mandates(self) -> DynArray[MandateRecord]:
        return self.mandates

    @gl.public.view
    def get_executions(self) -> DynArray[ExecutionRecord]:
        return self.executions

    @gl.public.view
    def get_adjudications(self) -> DynArray[AdjudicationRecord]:
        return self.adjudications

    @gl.public.view
    def get_permits(self) -> DynArray[PermitRecord]:
        return self.permits

    @gl.public.write
    def create_mandate(
        self,
        governance_chain_id: u256,
        proposal_hash: bytes,
        proposal_text_sha256: bytes,
        mandate_version: u256,
        mandate_digest: bytes,
    ) -> str:
        self._only_owner()
        mandate_id = self._id("MAN", self.next_mandate_number)
        self.next_mandate_number += 1
        self.mandates.append(MandateRecord(
            mandate_id,
            governance_chain_id,
            proposal_hash,
            proposal_text_sha256,
            mandate_version,
            mandate_digest,
            "MANDATE_DRAFT",
            u256(0),
        ))
        return mandate_id

    @gl.public.write
    def freeze_mandate(self, mandate_id: str, frozen_at: u256):
        self._only_owner()
        mandate = self._find_mandate(mandate_id)
        assert mandate.state == "MANDATE_DRAFT"
        mandate.state = "MANDATE_FROZEN"
        mandate.frozen_at = frozen_at

    @gl.public.write
    def commit_execution(
        self,
        mandate_id: str,
        chain_id: u256,
        bundle_hash: bytes,
        targets_digest: bytes,
        calldata_value_digest: bytes,
        code_facts_digest: bytes,
    ) -> str:
        self._only_owner()
        mandate = self._find_mandate(mandate_id)
        assert mandate.state == "MANDATE_FROZEN"
        execution_id = self._id("EXE", self.next_execution_number)
        self.next_execution_number += 1
        self.executions.append(ExecutionRecord(
            execution_id,
            mandate_id,
            chain_id,
            bundle_hash,
            targets_digest,
            calldata_value_digest,
            code_facts_digest,
            "EXECUTION_COMMITTED",
            b"",
            u256(0),
        ))
        return execution_id

    @gl.public.write
    def authenticate_evidence(self, execution_id: str, evidence_hash: bytes):
        self._only_owner()
        execution = self._find_execution(execution_id)
        assert execution.state == "EXECUTION_COMMITTED"
        assert evidence_hash != b""
        execution.evidence_hash = evidence_hash
        execution.state = "EVIDENCE_AUTHENTICATED"

    @gl.public.write
    def record_adjudication(
        self,
        execution_id: str,
        generation: u256,
        intent_satisfied: bool,
        scope_expanded: bool,
        prohibited_effect_present: bool,
        economic_terms_consistent: bool,
        administrative_authority_changed: bool,
        implementation_behavior_consistent: bool,
        evidence_sufficient: bool,
        created_at: u256,
    ) -> str:
        self._only_owner()
        execution = self._find_execution(execution_id)
        assert execution.state == "EVIDENCE_AUTHENTICATED"
        assert generation > execution.generation
        adjudication_id = self._id("ADJ", self.next_adjudication_number)
        self.next_adjudication_number += 1
        verdict = self._derive_verdict(
            intent_satisfied,
            scope_expanded,
            prohibited_effect_present,
            economic_terms_consistent,
            administrative_authority_changed,
            implementation_behavior_consistent,
            evidence_sufficient,
        )
        self.adjudications.append(AdjudicationRecord(
            adjudication_id,
            execution_id,
            execution.evidence_hash,
            generation,
            SEMANTIC_SCHEMA,
            intent_satisfied,
            scope_expanded,
            prohibited_effect_present,
            economic_terms_consistent,
            administrative_authority_changed,
            implementation_behavior_consistent,
            evidence_sufficient,
            verdict,
            created_at,
        ))
        execution.generation = generation
        execution.state = "ADJUDICATED"
        return adjudication_id

    @gl.public.write
    def issue_permit(
        self,
        execution_id: str,
        adjudication_id: str,
        mandate_version: u256,
        proposal_hash: bytes,
        targets_digest: bytes,
        calldata_value_digest: bytes,
        code_facts_digest: bytes,
        issued_at: u256,
        expires_at: u256,
        permit_binding_hash: bytes,
    ) -> str:
        self._only_owner()
        execution = self._find_execution(execution_id)
        adjudication = self._find_adjudication(adjudication_id)
        assert execution.state == "ADJUDICATED"
        assert adjudication.execution_id == execution_id
        assert adjudication.verdict == "EXECUTION_PERMITTED"
        assert expires_at > issued_at
        permit_id = self._id("PRM", self.next_permit_number)
        self.next_permit_number += 1
        self.permits.append(PermitRecord(
            permit_id,
            execution.mandate_id,
            mandate_version,
            proposal_hash,
            execution_id,
            execution.bundle_hash,
            execution.chain_id,
            targets_digest,
            calldata_value_digest,
            code_facts_digest,
            adjudication_id,
            adjudication.generation,
            SEMANTIC_SCHEMA,
            issued_at,
            expires_at,
            permit_binding_hash,
            "ACTIVE",
        ))
        return permit_id
