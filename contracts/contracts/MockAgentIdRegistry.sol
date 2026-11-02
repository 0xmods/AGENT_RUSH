// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockAgentIdRegistry
 * @dev Mock implementation of Binance Agent ID Registry for testing purposes.
 * 
 * IMPORTANT: This is a MOCK contract for development and testing only.
 * For mainnet, replace with the official Binance Agent ID Registry contract.
 * 
 * The official registry must provide:
 * - A stable, unique identifier for each Agent ID (not just display name)
 * - Ownership verification that persists through wallet transfers
 * - Methods to check if an address owns a valid Agent ID
 * 
 * Do not deploy this mock to mainnet.
 */
contract MockAgentIdRegistry {
    // Mapping: wallet address -> agent ID (bytes32 for stable identifier)
    mapping(address => bytes32) public agentIdOf;
    
    // Mapping: agent ID -> owner address (for reverse lookup)
    mapping(bytes32 => address) public ownerOfAgentId;
    
    // Mapping: agent ID -> handle (for display purposes only)
    mapping(bytes32 => string) public handleOfAgentId;
    
    // Track if an agent ID is revoked/expired
    mapping(bytes32 => bool) public isRevoked;
    
    // Events
    event AgentIdRegistered(address indexed wallet, bytes32 indexed agentId, string handle);
    event AgentIdTransferred(address indexed from, address indexed to, bytes32 indexed agentId);
    event AgentIdRevoked(bytes32 indexed agentId);
    event AgentIdRestored(bytes32 indexed agentId);

    /**
     * @dev Register a new Agent ID for a wallet (mock only)
     * @param wallet The wallet address
     * @param agentId The stable unique identifier (bytes32)
     * @param handle The display handle (e.g., "0xmod.ai")
     */
    function registerAgentId(address wallet, bytes32 agentId, string calldata handle) external {
        require(agentIdOf[wallet] == bytes32(0), "Wallet already has Agent ID");
        require(ownerOfAgentId[agentId] == address(0), "Agent ID already exists");
        require(bytes(handle).length > 0, "Handle cannot be empty");
        
        agentIdOf[wallet] = agentId;
        ownerOfAgentId[agentId] = wallet;
        handleOfAgentId[agentId] = handle;
        isRevoked[agentId] = false;
        
        emit AgentIdRegistered(wallet, agentId, handle);
    }

    /**
     * @dev Transfer Agent ID to another wallet (simulates real transfer behavior)
     * @param from Current owner
     * @param to New owner
     * @param agentId The agent ID to transfer
     */
    function transferAgentId(address from, address to, bytes32 agentId) external {
        require(ownerOfAgentId[agentId] == from, "Not owner");
        require(to != address(0), "Invalid recipient");
        
        agentIdOf[from] = bytes32(0);
        agentIdOf[to] = agentId;
        ownerOfAgentId[agentId] = to;
        
        emit AgentIdTransferred(from, to, agentId);
    }

    /**
     * @dev Revoke an Agent ID (simulates expiration/revocation)
     * @param agentId The agent ID to revoke
     */
    function revokeAgentId(bytes32 agentId) external {
        require(ownerOfAgentId[agentId] != address(0), "Agent ID does not exist");
        require(!isRevoked[agentId], "Already revoked");
        
        address owner = ownerOfAgentId[agentId];
        agentIdOf[owner] = bytes32(0);
        isRevoked[agentId] = true;
        
        emit AgentIdRevoked(agentId);
    }

    /**
     * @dev Restore a revoked Agent ID (for testing)
     * @param agentId The agent ID to restore
     * @param newOwner The new owner address
     */
    function restoreAgentId(bytes32 agentId, address newOwner) external {
        require(isRevoked[agentId], "Not revoked");
        require(newOwner != address(0), "Invalid owner");
        
        ownerOfAgentId[agentId] = newOwner;
        agentIdOf[newOwner] = agentId;
        isRevoked[agentId] = false;
        
        emit AgentIdRestored(agentId);
    }

    /**
     * @dev Check if a wallet has a valid (non-revoked) Agent ID
     * @param wallet The wallet address to check
     * @return True if wallet has valid Agent ID
     */
    function hasValidAgentId(address wallet) external view returns (bool) {
        bytes32 agentId = agentIdOf[wallet];
        return agentId != bytes32(0) && !isRevoked[agentId];
    }

    /**
     * @dev Get the Agent ID of a wallet
     * @param wallet The wallet address
     * @return The agent ID (bytes32), or 0 if none
     */
    function getAgentId(address wallet) external view returns (bytes32) {
        return agentIdOf[wallet];
    }

    /**
     * @dev Get the owner of an Agent ID
     * @param agentId The agent ID
     * @return The owner address
     */
    function getOwner(bytes32 agentId) external view returns (address) {
        return ownerOfAgentId[agentId];
    }

    /**
     * @dev Get the handle of an Agent ID
     * @param agentId The agent ID
     * @return The handle string
     */
    function getHandle(bytes32 agentId) external view returns (string memory) {
        return handleOfAgentId[agentId];
    }

    /**
     * @dev Check if an Agent ID is revoked
     * @param agentId The agent ID
     * @return True if revoked
     */
    function isAgentIdRevoked(bytes32 agentId) external view returns (bool) {
        return isRevoked[agentId];
    }
}