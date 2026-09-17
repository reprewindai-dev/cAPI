import { describe, expect, it, beforeEach } from "vitest";
import { CovenantEngine } from "./engine";
import { ServiceRegistry, InMemoryRegistryStore } from "./service-registry";
import { type CapabilityIdentity } from "./types";

describe("CovenantEngine Hydration & Reconciliation", () => {
  it("persistent capability survives restart", async () => {
    // Simulate persistent store
    const store = new InMemoryRegistryStore();
    const services = new ServiceRegistry(store);
    
    // Register a service
    await services.register({
      service_name: "test-svc",
      base_url: "http://test",
      capabilities: [{ name: "cap1", endpoint: "http://test/cap1" }]
    }, true);

    // Engine "restarts", but is wired to the same persistent store
    const engine = new CovenantEngine();
    // We override the services for testing purposes
    (engine as any).services = services;
    
    // Sync to hydrate
    await engine.syncRegistry(true);
    
    expect(engine.runtime.capabilities.has("svc::test-svc::cap1")).toBe(true);
  });

  it("remotely deleted/revoked capability is removed locally", async () => {
    const store = new InMemoryRegistryStore();
    const services = new ServiceRegistry(store);
    const engine = new CovenantEngine();
    (engine as any).services = services;

    // 1. Service has cap1
    await services.register({
      service_name: "test-svc",
      base_url: "http://test",
      capabilities: [{ name: "cap1", endpoint: "http://test/cap1" }]
    }, true);
    await engine.syncRegistry(true);
    expect(engine.runtime.capabilities.has("svc::test-svc::cap1")).toBe(true);

    // 2. Service updates to remove cap1 (e.g. remotely revoked)
    await services.register({
      service_name: "test-svc",
      base_url: "http://test",
      capabilities: [] // removed!
    }, true);
    
    await engine.syncRegistry(true);
    expect(engine.runtime.capabilities.has("svc::test-svc::cap1")).toBe(false);
  });

  it("changed capability replaces its stale representation", async () => {
    const store = new InMemoryRegistryStore();
    const services = new ServiceRegistry(store);
    const engine = new CovenantEngine();
    (engine as any).services = services;

    // Register v1
    await services.register({
      service_name: "test-svc",
      base_url: "http://test",
      capabilities: [{ name: "cap1", endpoint: "http://test/v1" }]
    }, true);
    await engine.syncRegistry(true);
    expect(engine.runtime.capabilities.get("svc::test-svc::cap1")?.endpoint).toBe("http://test/v1");

    // Register v2
    await services.register({
      service_name: "test-svc",
      base_url: "http://test",
      capabilities: [{ name: "cap1", endpoint: "http://test/v2" }]
    }, true);
    await engine.syncRegistry(true);
    expect(engine.runtime.capabilities.get("svc::test-svc::cap1")?.endpoint).toBe("http://test/v2");
  });

  it("empty authoritative capability set clears previously hydrated capabilities", async () => {
    const store = new InMemoryRegistryStore();
    const services = new ServiceRegistry(store);
    const engine = new CovenantEngine();
    (engine as any).services = services;

    await services.register({
      service_name: "test-svc",
      base_url: "http://test",
      capabilities: [{ name: "cap1", endpoint: "http://test/v1" }]
    }, true);
    await engine.syncRegistry(true);
    
    // Remote authoritative set is emptied (e.g. service deleted)
    await services.delete("test-svc");
    await engine.syncRegistry(true);
    expect(engine.runtime.capabilities.size).toBe(0);
  });

  it("repeated hydration is idempotent", async () => {
    const store = new InMemoryRegistryStore();
    const services = new ServiceRegistry(store);
    const engine = new CovenantEngine();
    (engine as any).services = services;

    await services.register({
      service_name: "test-svc",
      base_url: "http://test",
      capabilities: [{ name: "cap1", endpoint: "http://test/v1" }]
    }, true);
    
    await engine.syncRegistry(true);
    const sizeAfter1 = engine.runtime.capabilities.size;
    await engine.syncRegistry(true);
    const sizeAfter2 = engine.runtime.capabilities.size;
    expect(sizeAfter1).toBe(1);
    expect(sizeAfter2).toBe(1);
  });

  it("failed/partial hydration cannot silently retain unauthorized stale authority", async () => {
    const store = new InMemoryRegistryStore();
    const services = new ServiceRegistry(store);
    const engine = new CovenantEngine();
    (engine as any).services = services;

    await services.register({
      service_name: "test-svc",
      base_url: "http://test",
      capabilities: [{ name: "cap1", endpoint: "http://test/v1" }]
    }, true);
    await engine.syncRegistry(true);
    expect(engine.runtime.capabilities.has("svc::test-svc::cap1")).toBe(true);

    // Force a network failure in the store
    store.list = async () => { throw new Error("Connection lost"); };

    try {
      await engine.syncRegistry(true);
    } catch (e) {
      // Expected to throw
    }

    // Fail-closed principle: if authority cannot be verified, it must be revoked.
    expect(engine.runtime.capabilities.has("svc::test-svc::cap1")).toBe(false);
  });

  it("restart cannot resurrect a deleted capability from cache/local persistence", async () => {
    const store = new InMemoryRegistryStore();
    const services = new ServiceRegistry(store);
    
    await services.register({
      service_name: "test-svc",
      base_url: "http://test",
      capabilities: [{ name: "cap1", endpoint: "http://test/cap1" }]
    }, true);
    
    await services.register({
      service_name: "test-svc",
      base_url: "http://test",
      capabilities: [] // deleted remotely
    }, true);

    const engine = new CovenantEngine();
    (engine as any).services = services;
    await engine.syncRegistry(true);
    expect(engine.runtime.capabilities.has("svc::test-svc::cap1")).toBe(false);
  });
});
