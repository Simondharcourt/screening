from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# Explicitly load .env into os.environ so all external libraries (Anthropic, OpenAI) find their keys
load_dotenv()

app = FastAPI(
    title="HR AI Screening Platform API",
    description="Backend API for the HR AI Screening Platform",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins, we can restrict this to the frontend URL later
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

from app.routers import jobs, candidates, chat, matching, vapi

@app.get("/")
async def root():
    return {"message": "Welcome to the HR AI Screening Platform API"}

app.include_router(jobs.router)
app.include_router(candidates.router)
app.include_router(chat.router)
app.include_router(matching.router)
app.include_router(vapi.router)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
