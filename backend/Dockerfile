FROM python:3.12-slim

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

# Expose port and run the server
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
