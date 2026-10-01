# Listening Field Analysis Service V1

Local asynchronous Node service built on the unchanged V0 upload, native FFprobe/FFmpeg decoder,
and `analyzeUpload` analysis path. No cloud services or authentication are included.

## Run

Install native `ffmpeg` and `ffprobe` on `PATH`, or set `LISTENING_FIELD_FFMPEG_PATH` and
`LISTENING_FIELD_FFPROBE_PATH` to executable paths. Then run `npm run service:listening-field`.
The service listens on `127.0.0.1:8787` by default; `HOST` and `PORT` can override this.

```sh
curl -s -F audio=@track.mp3 http://127.0.0.1:8787/v1/jobs
curl -s http://127.0.0.1:8787/v1/jobs/JOB_ID
curl -s http://127.0.0.1:8787/v1/records/RECORD_ID
```

`POST /v1/jobs` returns HTTP 202 with `{ "jobId": "...", "status": "queued" }` after the
encoded upload is validated and persisted. `GET /v1/jobs/:jobId` returns `queued`, `analyzing`,
`ready` with `recordUrl`, or `failed` with a structured error. `GET /v1/records/:recordId`
returns the validated immutable `ListeningFieldRecordV1`. Unknown IDs return 404. The V0
`POST /v1/listening-field` synchronous diagnostic endpoint remains available.

## Local operation

The data directory defaults to the operating system temporary directory under
`listening-field-analysis-v1-<user-id>`. Job JSON and result JSON persist there across service
restarts. Random upload directories are removed after a job finishes or fails. Jobs left
`analyzing` at startup are marked failed with `PROCESS_RESTARTED`; queued jobs are retried.
Only one analysis runs at a time, in FIFO order.

The SHA-256 cache key covers the encoded source hash, engine version, ListeningRecord projection
version, ListeningField projector/schema version, and native decoder command paths and options.
Concurrent duplicates share a job and completed duplicates reuse its exact record. Change the
version identity whenever these semantics change. Embedding callers that inject a custom decoder
or analysis function should supply an explicit `analysisVersions` identity.

Job timing metadata (`queuedAt`, `startedAt`, `completedAt`, probe/decode/analysis milliseconds,
and total milliseconds) lives only in local job metadata, never in the product record.

This remains a single-process local implementation. A production deployment needs external
durable queue and object storage, cross-process duplicate coordination, authentication, resource
policies, and operational monitoring.
