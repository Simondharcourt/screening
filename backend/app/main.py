from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import logging

logger = logging.getLogger(__name__)

# Explicitly load .env into os.environ so all external libraries find their keys
load_dotenv()

from app.core.langfuse_helper import init_langfuse
init_langfuse()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize Redis search indexes for the LangGraph checkpointer
    try:
        from app.routers.onboarding import _checkpointer
        _checkpointer.setup()
        logger.info("RedisSaver indexes initialized")
    except Exception as e:
        logger.warning(f"RedisSaver setup failed (Redis may be unavailable): {e}")
    yield


app = FastAPI(
    title="HR AI Screening Platform API",
    description="Backend API for the HR AI Screening Platform",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins, we can restrict this to the frontend URL later
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

from app.routers import jobs, candidates, chat, matching, vapi, onboarding, candidate_me

@app.get("/")
async def root():
    return {"message": "Welcome to the HR AI Screening Platform API"}

app.include_router(jobs.router)
app.include_router(candidates.router)
app.include_router(chat.router)
app.include_router(matching.router)
app.include_router(vapi.router)
app.include_router(onboarding.router)
app.include_router(candidate_me.router)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
