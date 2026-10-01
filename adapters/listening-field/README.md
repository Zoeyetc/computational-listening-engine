# Listening Field analysis adapter

This adapter is the product presentation boundary for Listening Field. It composes the
computational-listening engine's production decoded-PCM path and public `ListeningRecordV1`
projection, then projects only Melody into `ListeningFieldRecordV1`.

Container decoding is intentionally outside this package. A server decodes an uploaded audio
asset into `PcmAudio` and calls `analyzeListeningFieldFromAudio(audio)`. The adapter has no React,
browser UI, HTTP, or Framer dependency.
