"""Query-time ML helpers.

Embeddings are served by an external endpoint (see `app.ml.embeddings`) so the
API process never loads torch / sentence-transformers and stays within a small
memory footprint.
"""
