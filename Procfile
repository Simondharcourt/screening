redis:    docker run --rm -p 6379:6379 redis/redis-stack-server:latest
api:      cd backend && uv run uvicorn app.main:app --reload --port 8000
worker:   cd backend && uv run celery -A app.worker.celery_app worker --beat --pool=solo --loglevel=info
frontend: cd frontend && npm run dev
