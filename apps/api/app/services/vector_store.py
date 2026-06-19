import shutil
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence

import chromadb
from chromadb.api.models.Collection import Collection
from chromadb.errors import InternalError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.paths import get_storage_root
from app.models.document_chunks import DocumentChunk
from app.models.documents import Document
from app.models.knowledge_bases import KnowledgeBase
from app.services.text_vectors import embed_text, embed_texts


COLLECTION_NAME = "document_chunks_v1"
CHROMA_DIRNAME = "chroma"


def get_vector_store_dir() -> Path:
    path = get_storage_root() / CHROMA_DIRNAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_collection() -> Collection:
    try:
        client = chromadb.PersistentClient(path=str(get_vector_store_dir()))
        return client.get_or_create_collection(name=COLLECTION_NAME, metadata={"hnsw:space": "cosine"})
    except InternalError as exc:
        # Recover from corrupted/incompatible local Chroma metadata state.
        if "no such table" not in str(exc).lower():
            raise
        reset_vector_store_dir()
        client = chromadb.PersistentClient(path=str(get_vector_store_dir()))
        return client.get_or_create_collection(name=COLLECTION_NAME, metadata={"hnsw:space": "cosine"})


def reset_vector_store_dir() -> None:
    vector_dir = get_vector_store_dir()
    if vector_dir.exists():
        shutil.rmtree(vector_dir, ignore_errors=True)
    vector_dir.mkdir(parents=True, exist_ok=True)


def delete_document_vectors(document_id: str) -> None:
    collection = get_collection()
    collection.delete(where={"document_id": document_id})


def delete_knowledge_base_vectors(knowledge_base_id: str) -> None:
    collection = get_collection()
    collection.delete(where={"knowledge_base_id": knowledge_base_id})


def sync_document_vectors(
    knowledge_base_name: str,
    document_name: str,
    document_id: str,
    knowledge_base_id: str,
    chunks: Sequence[DocumentChunk],
) -> None:
    collection = get_collection()
    collection.delete(where={"document_id": document_id})
    if not chunks:
        return

    collection.upsert(
        ids=[chunk.vector_id for chunk in chunks],
        embeddings=embed_texts(chunk.text for chunk in chunks),
        documents=[chunk.text for chunk in chunks],
        metadatas=[
            {
                "knowledge_base_id": knowledge_base_id,
                "knowledge_base_name": knowledge_base_name,
                "document_id": document_id,
                "document_name": document_name,
                "location_label": chunk.location_label,
                "chunk_index": chunk.chunk_index,
            }
            for chunk in chunks
        ],
    )


def backfill_vectors_for_knowledge_bases(session: Session, knowledge_base_ids: Sequence[str]) -> None:
    if not knowledge_base_ids:
        return

    stmt = (
        select(DocumentChunk, Document.name, KnowledgeBase.name)
        .join(Document, Document.id == DocumentChunk.document_id)
        .join(KnowledgeBase, KnowledgeBase.id == DocumentChunk.knowledge_base_id)
        .where(DocumentChunk.knowledge_base_id.in_(knowledge_base_ids))
        .where(Document.parse_status == "done")
        .order_by(DocumentChunk.document_id.asc(), DocumentChunk.chunk_index.asc())
    )

    rows = list(session.execute(stmt).all())
    grouped: Dict[str, Dict[str, Any]] = {}
    for chunk, document_name, knowledge_base_name in rows:
        payload = grouped.setdefault(
            chunk.document_id,
            {
                "knowledge_base_id": chunk.knowledge_base_id,
                "knowledge_base_name": knowledge_base_name,
                "document_name": document_name,
                "chunks": [],
            },
        )
        payload["chunks"].append(chunk)

    for document_id, payload in grouped.items():
        sync_document_vectors(
            knowledge_base_name=payload["knowledge_base_name"],
            document_name=payload["document_name"],
            document_id=document_id,
            knowledge_base_id=payload["knowledge_base_id"],
            chunks=payload["chunks"],
        )


def query_vectors(knowledge_base_ids: Sequence[str], question: str, top_k: int) -> Dict[str, List[Any]]:
    collection = get_collection()
    if not knowledge_base_ids:
        return {"ids": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}

    return collection.query(
        query_embeddings=[embed_text(question)],
        n_results=top_k,
        where={"knowledge_base_id": {"$in": list(knowledge_base_ids)}},
        include=["documents", "metadatas", "distances"],
    )
