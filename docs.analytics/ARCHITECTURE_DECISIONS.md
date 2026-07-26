# Architecture Decisions

This document records major architectural decisions for Veefore.

Each decision should include:

* Decision ID
* Date
* Status
* Context
* Decision
* Alternatives Considered
* Consequences

---

# ADR-001

## Title

Backend Architecture

Status

Accepted

Context

Veefore is an early-stage SaaS product with a small engineering team.

Decision

Use a modular monolith instead of microservices.

Alternatives

* Microservices
* Service-oriented architecture

Reason

Simpler deployment, easier debugging, lower operational cost, and a clear migration path if scale requires service extraction later.

---

# ADR-002

## Title

Database

Status

Accepted

Decision

Use MongoDB Atlas as the primary application database.

Reason

Flexible schema, good fit for connected social account data, and suitable for iterative product development.

---

# ADR-003

## Title

Analytics APIs

Status

Accepted

Decision

Use dashboard-oriented APIs instead of widget-oriented APIs.

Reason

Reduces frontend network requests, simplifies caching, and improves dashboard load performance.

---

# ADR-004

## Title

Analytics Processing

Status

Accepted

Decision

Store normalized events and aggregated rollups. Compute many derived metrics from these sources rather than persisting every calculated value.

Reason

Improves flexibility when formulas change and reduces redundant storage.

---

# Rules

* Never modify an accepted decision without creating a new ADR.
* Preserve historical decisions.
* Record why a decision was made, not just what was chosen.
