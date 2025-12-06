# Database Consolidation Plan

## Goals
Reduce operational complexity, improve consistency, and enable robust migrations and backups.

## Approach
1. Choose a primary datastore for core entities (users, workspaces, content, schedules): Postgres (Drizzle) or Mongo (Mongoose).
2. Define boundaries: secondary store allowed only for niche modules; avoid dual-primary overlap.
3. Implement migrations:
   - Postgres: add drizzle-kit migration directory and seed scripts.
   - Mongo: add idempotent migration scripts with validators and indexes.
4. Backups: daily automated backups, restore tests monthly; document DR (RPO/RTO).
5. Indexes: add composite indexes for hot queries (content by workspace/status/time).

## Rollout
1. Mirror writes (dual-write) for a short phase; verify integrity via checks.
2. Cut over reads then writes to the primary datastore; monitor Sentry and Prometheus metrics.
3. Decommission redundant collections/tables and remove converters.
