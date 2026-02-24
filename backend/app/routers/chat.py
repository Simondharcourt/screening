from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from app.agents.candidate_coach_agent import coach_agent, ExtractedProfile
from langchain_core.messages import HumanMessage, AIMessage
import json
import asyncio

router = APIRouter(prefix="/chat", tags=["Chat"])

class ChatMessage(BaseModel):
    role: str # "user" or "assistant"
    content: str
    
class ChatRequest(BaseModel):
    session_id: str
    message: str

# Async generator for Server-Sent Events (SSE)
async def generate_chat_stream(session_id: str, new_message: str):
    config = {"configurable": {"thread_id": session_id}}
    
    # Send the user message into the graph
    # LangGraph will store this in its memory saver
    inputs = {"messages": [HumanMessage(content=new_message)]}
    
    # We use astream_events to catch the LLM streaming tokens
    # Note: in a real app, you'd filter events to only yield tokens from the 'chat' node,
    # and ignore the tokens from the 'extract' node running in the background.
    
    # We yield SSE formatted strings: data: {"token": "hello"}\n\n
    try:
        async for event in coach_agent.astream_events(inputs, config, version="v2"):
             kind = event["event"]
             
             # We only want to stream tokens from the chat node's LLM
             if kind == "on_chat_model_stream":
                 # Check if the event is coming from the chat_node
                 if "chat" in event.get("tags", []) or event.get("metadata", {}).get("langgraph_node") == "chat":
                     content = event["data"]["chunk"].content
                     if content:
                         yield f"data: {json.dumps({'token': content})}\n\n"
             
             # When the graph finishes, we can optionally yield the final extracted profile
             elif kind == "on_chain_end" and event["name"] == "LangGraph":
                 final_state = event["data"].get("output", {})
                 if "extracted_profile" in final_state:
                     profile = final_state["extracted_profile"]
                     # We can send a special event type for the profile update
                     if isinstance(profile, ExtractedProfile):
                         yield f"event: profile_update\ndata: {profile.json()}\n\n"
                     else:
                         # In case it's a dict
                         yield f"event: profile_update\ndata: {json.dumps(profile)}\n\n"
                         
    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
        
    yield "event: done\ndata: {}\n\n"

@router.post("/candidate")
async def chat_with_candidate(request: ChatRequest):
    """
    Accepts a user message, runs the coach agent, and streams the response back via SSE.
    """
    return StreamingResponse(
        generate_chat_stream(request.session_id, request.message),
        media_type="text/event-stream"
    )

@router.get("/candidate/{session_id}/history")
async def get_chat_history(session_id: str):
    """Retrieves the chat history for a given session."""
    config = {"configurable": {"thread_id": session_id}}
    state = coach_agent.get_state(config)
    
    if not state or not state.values:
        return {"messages": [], "profile": None}
        
    messages = []
    for m in state.values.get("messages", []):
        messages.append({
            "role": "user" if isinstance(m, HumanMessage) else "assistant",
            "content": m.content
        })
        
    profile = state.values.get("extracted_profile")
    if isinstance(profile, ExtractedProfile):
        profile = profile.dict()
        
    return {
        "messages": messages,
        "profile": profile
    }
