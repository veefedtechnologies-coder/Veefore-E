/**
 * Integration tests for the DB-backed Provider_Capability_Registry service (task 2.3).
 *
 * Exercises the exact Mongoose model and persistence the service performs against
 * a real (in-memory) MongoDB — no mocks. Verifies:
 *  - seed persists Gemini Omni / Veo records and is idempotent (Req 7.1)
 *  - persisted records hydrate into the pure-core query surface (Req 7.3)
 *  - version history is append-only and prior versions are retained (Req 7.5)
 *  - duplicate (provider, model, version) is rejected at the DB level (Req 7.5)
 *  - unknown provider/model yields an explicit unsupported result (Req 7.4)
 *  - the deterministic-performable operation-kind set gates correctly (Req 6.1, 6.3)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { VideoModelCapabilitiesModel } from '../server/models/VideoEditor';
import { ProviderCapabilityRegistryService } from '../server/features/video-editor/services/provider-capability-registry.service';
import {
  SEED_VIDEO_MODEL_CAPABILITIES,
  SEED_DETERMINISTIC_PERFORMABLE_KINDS,
} from '../server/features/video-editor/services/provider-capability-seed';
import type { VideoModelCapabilities } from '../server/features/video-editor/services/provider-capability-registry.logic';

// Use the SAME mongoose instance the model is bound to (the repo has a root and
// a server-level mongoose install), so our connection backs the model's queries.
const mongoose = VideoModelCapabilitiesModel.base;

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await VideoModelCapabilitiesModel.deleteMany({});
}, 30_000);

const baseRecord = (overrides: Partial<VideoModelCapabilities> = {}): VideoModelCapabilities => ({
  provider: 'gemini',
  model: 'omni-1',
  version: '1.0.0',
  supportedOperations: ['generative_edit'],
  editableInputSeconds: { min: 1, max: 8 },
  outputSeconds: { min: 1, max: 8 },
  outputResolutions: ['1080x1920'],
  inputModalities: ['video'],
  outputModalities: ['video'],
  priorityRank: 10,
  costPerOutputSecondInr: 3.5,
  guaranteesPreservation: ['face'],
  ...overrides,
});

describe('ProviderCapabilityRegistryService — seeding', () => {
  it('persists the Gemini Omni / Veo seed records and is idempotent', async () => {
    const svc = new ProviderCapabilityRegistryService();

    const inserted = await svc.seed();
    expect(inserted).toBe(SEED_VIDEO_MODEL_CAPABILITIES.length);

    const count = await VideoModelCapabilitiesModel.countDocuments({});
    expect(count).toBe(SEED_VIDEO_MODEL_CAPABILITIES.length);

    // Re-seeding a fresh instance inserts nothing (idempotent, append-only).
    const svc2 = new ProviderCapabilityRegistryService();
    const insertedAgain = await svc2.seed();
    expect(insertedAgain).toBe(0);
    expect(await VideoModelCapabilitiesModel.countDocuments({})).toBe(
      SEED_VIDEO_MODEL_CAPABILITIES.length,
    );
  });

  it('makes seeded providers queryable via lookup and candidatesFor', async () => {
    const svc = new ProviderCapabilityRegistryService();
    await svc.seed();

    const omni = await svc.lookup('gemini', 'omni-1');
    expect(omni.supported).toBe(true);
    if (omni.supported) {
      expect(omni.caps.supportedOperations).toContain('generative_edit');
      expect(omni.caps.editableInputSeconds.max).toBeGreaterThan(0);
    }

    // Both seeded providers support 'generate'; higher priorityRank wins ordering.
    const candidates = await svc.candidatesFor('generate');
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates[0].priorityRank).toBeGreaterThanOrEqual(
      candidates[candidates.length - 1].priorityRank,
    );
  });
});

describe('ProviderCapabilityRegistryService — append-only versioning (Req 7.5)', () => {
  it('retains prior versions when a new version is registered', async () => {
    const svc = new ProviderCapabilityRegistryService();

    const v1 = await svc.register(baseRecord({ version: '1.0.0' }));
    expect(v1.ok).toBe(true);
    const v2 = await svc.register(
      baseRecord({ version: '2.0.0', supportedOperations: ['generative_edit', 'inpaint'] }),
    );
    expect(v2.ok).toBe(true);

    const versions = await svc.versionsOf('gemini', 'omni-1');
    expect(versions.map((v) => v.version)).toEqual(['1.0.0', '2.0.0']);

    // Latest version wins on lookup.
    const current = await svc.lookup('gemini', 'omni-1');
    expect(current.supported && current.caps.version).toBe('2.0.0');

    // Both versions persisted as distinct immutable documents.
    expect(await VideoModelCapabilitiesModel.countDocuments({})).toBe(2);
  });

  it('rejects a duplicate (provider, model, version) and stores nothing extra', async () => {
    const svc = new ProviderCapabilityRegistryService();
    expect((await svc.register(baseRecord())).ok).toBe(true);

    const dup = await svc.register(baseRecord());
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('DUPLICATE_VERSION');

    expect(await VideoModelCapabilitiesModel.countDocuments({})).toBe(1);
  });

  it('rejects a record missing a required field, naming the field, and persists nothing', async () => {
    const svc = new ProviderCapabilityRegistryService();
    const broken = baseRecord();
    // @ts-expect-error intentionally drop a required field
    delete broken.outputResolutions;

    const result = await svc.register(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MISSING_FIELD');
      expect(result.error.field).toBe('outputResolutions');
    }
    expect(await VideoModelCapabilitiesModel.countDocuments({})).toBe(0);
  });

  it('persisted history survives a fresh service load (rehydration order)', async () => {
    const writer = new ProviderCapabilityRegistryService();
    await writer.register(baseRecord({ version: '1.0.0' }));
    await writer.register(baseRecord({ version: '1.1.0' }));

    // A brand-new instance hydrates purely from persisted documents.
    const reader = new ProviderCapabilityRegistryService();
    const versions = await reader.versionsOf('gemini', 'omni-1');
    expect(versions.map((v) => v.version)).toEqual(['1.0.0', '1.1.0']);
  });
});

describe('ProviderCapabilityRegistryService — lookups & deterministic gate', () => {
  it('returns explicit unsupported for an unknown provider/model (Req 7.4)', async () => {
    const svc = new ProviderCapabilityRegistryService();
    await svc.seed();
    const result = await svc.lookup('nope', 'ghost-9');
    expect(result).toEqual({ supported: false });
  });

  it('gates every seeded deterministic-performable kind (Req 6.1)', () => {
    const svc = new ProviderCapabilityRegistryService();
    for (const kind of SEED_DETERMINISTIC_PERFORMABLE_KINDS) {
      expect(svc.isDeterministicPerformable(kind)).toBe(true);
    }
    // Case-insensitive; a generative kind is not deterministic-performable.
    expect(svc.isDeterministicPerformable('TRIM')).toBe(true);
    expect(svc.isDeterministicPerformable('generative_edit')).toBe(false);
  });
});
