from langchain_huggingface import HuggingFaceEmbeddings
from typing import List

# multilingual-e5-large produces 1024-dimensional vectors
# Lazy-loaded to avoid PyTorch/OpenMP SIGSEGV when Celery forks workers
_embeddings_model = None

def _get_model() -> HuggingFaceEmbeddings:
    global _embeddings_model
    if _embeddings_model is None:
        _embeddings_model = HuggingFaceEmbeddings(
            model_name="intfloat/multilingual-e5-large",
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
    return _embeddings_model

class EmbeddingService:
    @staticmethod
    def generate(text: str) -> List[float]:
        if not text:
            text = " "
        return _get_model().embed_query(text)
