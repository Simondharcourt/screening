from typing import List, Dict, Any, TypedDict
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel as LangchainBaseModel, Field
from langgraph.graph import StateGraph, END
from app.core.config import settings
import os

# --- 1. Define State ---
class JobAgentState(TypedDict):
    title: str
    bullet_points: str
    description: str
    questions: List[str]

# --- 2. Define LLM Outputs ---
# We use Pydantic to ensure Claude returns exactly what we want structurally for questions.
class QuestionsOutput(LangchainBaseModel):
    questions: List[str] = Field(description="A list of 5 screening questions.")

# --- 3. Define Nodes ---
def generate_description_node(state: JobAgentState) -> Dict[str, Any]:
    """Generates the full job description based on title and bullet points."""
    llm = ChatAnthropic(model=settings.LLM_MODEL, temperature=0.7, api_key=settings.ANTHROPIC_API_KEY)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert HR copywriter. Create a professional, engaging job description. "
                   "Output ONLY the job description text, structured with markdown (Missions, Profile, etc.). "
                   "Do not include placeholders, return a ready-to-publish text."),
        ("user", "Job Title: {title}\nKey requirements/points: {bullet_points}")
    ])
    
    chain = prompt | llm
    response = chain.invoke({
        "title": state["title"],
        "bullet_points": state["bullet_points"]
    })
    
    return {"description": response.content}

def generate_questions_node(state: JobAgentState) -> Dict[str, Any]:
    """Extracts 5 pre-qualification screening questions from the description."""
    # Using temperature 0 for more deterministic, focused questions
    llm = ChatAnthropic(model=settings.LLM_MODEL, temperature=0, api_key=settings.ANTHROPIC_API_KEY)
    
    # Bind the LLM to output the structured Pydantic model
    structured_llm = llm.with_structured_output(QuestionsOutput)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert technical recruiter. Based on the following job description, "
                   "generate exactly 5 pre-qualification screening questions to ask candidates during a first short interview. "
                   "The questions must evaluate hard skills or direct experience, NOT personality traits. "
                   "Make them concise and directly answerable."),
        ("user", "Job Description:\n{description}")
    ])
    
    chain = prompt | structured_llm
    response = chain.invoke({"description": state["description"]})
    
    return {"questions": response.questions}

# --- 4. Build Graph ---
def build_job_agent() -> StateGraph:
    workflow = StateGraph(JobAgentState)
    
    workflow.add_node("generate_description", generate_description_node)
    workflow.add_node("generate_questions", generate_questions_node)
    
    workflow.set_entry_point("generate_description")
    workflow.add_edge("generate_description", "generate_questions")
    workflow.add_edge("generate_questions", END)
    
    return workflow.compile()

# Singleton instance for the FASTAPI router to use
job_description_agent = build_job_agent()
