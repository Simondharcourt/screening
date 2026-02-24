from langchain_openai import OpenAIEmbeddings
from typing import List

# We use text-embedding-3-small which returns 1536-dimensional vectors
# Ensure OPENAI_API_KEY is in the environment
_embeddings_model = OpenAIEmbeddings(model="text-embedding-3-small")

class EmbeddingService:
    @staticmethod
    def generate(text: str) -> List[float]:
        if not text:
            # Provide an empty embedding or raise an error depending on business logic
            # Here we embed a space so it doesn't crash pgvector
            text = " "
        return _embeddings_model.embed_query(text)
