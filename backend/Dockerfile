FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies before copying the code to use Docker layer caching
RUN uv sync --no-dev --no-install-project

# Copy project code
COPY . .

# Install the project itself
RUN uv sync --no-dev

# Pre-bake the HuggingFace model so Railway/Docker doesn't re-download it at runtime (~560 MB)
ENV HF_HOME=/app/.cache/huggingface
RUN uv run python -c "from langchain_huggingface import HuggingFaceEmbeddings; HuggingFaceEmbeddings(model_name='intfloat/multilingual-e5-large', model_kwargs={'device': 'cpu'})"

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
