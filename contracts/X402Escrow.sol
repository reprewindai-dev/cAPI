// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title X402Escrow
 * @dev Settlement Ledger (x402) for Veklom: Cryptographic proof of paid compute.
 * Enforces X-Veklom-Receipt-ID and evidence hashing on chain.
 */
contract X402Escrow {
    
    struct ComputeJob {
        address client;
        address provider;
        uint256 stakeAmount;
        bytes32 evidenceHash;
        bool isSettled;
        bool isSlashed;
    }

    mapping(bytes32 => ComputeJob) public jobs; // receiptId -> ComputeJob

    event JobFunded(bytes32 indexed receiptId, address indexed client, uint256 amount);
    event JobSettled(bytes32 indexed receiptId, address indexed provider, bytes32 evidenceHash);
    event JobSlashed(bytes32 indexed receiptId, address indexed client);

    /**
     * @dev Fund a compute job with a specific VNP stake.
     * @param receiptId Unique X-Veklom-Receipt-ID
     * @param provider Address of the compute node
     */
    function fundJob(bytes32 receiptId, address provider) external payable {
        require(msg.value > 0, "Stake must be greater than 0");
        require(jobs[receiptId].client == address(0), "Job already exists");

        jobs[receiptId] = ComputeJob({
            client: msg.sender,
            provider: provider,
            stakeAmount: msg.value,
            evidenceHash: bytes32(0),
            isSettled: false,
            isSlashed: false
        });

        emit JobFunded(receiptId, msg.sender, msg.value);
    }

    /**
     * @dev Settle a completed job by providing the evidence hash.
     * @param receiptId Unique X-Veklom-Receipt-ID
     * @param evidenceHash The cryptographic proof of execution
     */
    function settleJob(bytes32 receiptId, bytes32 evidenceHash) external {
        ComputeJob storage job = jobs[receiptId];
        require(job.provider == msg.sender, "Only provider can settle");
        require(!job.isSettled && !job.isSlashed, "Job already finalized");
        require(job.stakeAmount > 0, "Invalid job stake");

        job.isSettled = true;
        job.evidenceHash = evidenceHash;

        (bool success, ) = job.provider.call{value: job.stakeAmount}("");
        require(success, "Transfer failed");

        emit JobSettled(receiptId, msg.sender, evidenceHash);
    }

    /**
     * @dev Slash a job if the provider fails to provide evidence in time or breaches SLA.
     * @param receiptId Unique X-Veklom-Receipt-ID
     */
    function slashJob(bytes32 receiptId) external {
        ComputeJob storage job = jobs[receiptId];
        // In production, this would be restricted to a governance multisig or CAPPO gate
        require(msg.sender == job.client, "Only client can initiate slash"); 
        require(!job.isSettled && !job.isSlashed, "Job already finalized");

        job.isSlashed = true;

        (bool success, ) = job.client.call{value: job.stakeAmount}("");
        require(success, "Transfer failed");

        emit JobSlashed(receiptId, msg.sender);
    }
}
