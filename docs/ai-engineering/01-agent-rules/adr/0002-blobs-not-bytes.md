# ADR 0002 — Bytes never travel in a gRPC payload

Status: accepted

## Context

A workflow's input is a `google.protobuf.Struct` that the orchestrator stores
in its job table and renders in its console. A base64 PDF inside it would hit
the default gRPC message limit, bloat the database and its backups, and be
painted into an HTML page.

## Decision

Inputs and outputs are `common.v1.BlobRef { uri, mime, size_bytes, sha256,
filename, key }`. The API is the only holder of storage credentials: it
stages inputs under a per-job scratch prefix, mints a presigned **GET** for
them and a presigned **PUT** for the output, and deletes both after the
response. The document service follows the URLs, verifies the sha256, and
sends the PUT with exactly the `Content-Type` the signature was made for.

One pragmatic exception: a small result (up to a per-workflow inline limit,
zero for conversions) may be returned inline, so the common "PDF → a few
hundred KB of HTML" round-trip needs no second download.

## Consequences

- Go and Python services hold no secrets; a leaked container image reveals nothing.
- Presigned URLs outlive any single step and expire well before a job is forgotten.
- gRPC message limits are sized for metadata and inline text, never for documents.
- Scratch objects that survive a crash sit under one prefix, which a storage lifecycle rule expires as a backstop.
- `file://` URIs are accepted by the document service for tests and local debugging only.
