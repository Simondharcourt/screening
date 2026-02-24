from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

@app.get("/")
async def root():
    return {"message": "Welcome to the HR AI Screening Platform API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
