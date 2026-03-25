"""
Exposes compiled LangGraph instances for LangGraph Studio / langgraph dev.
Not used by the FastAPI app — only by the langgraph CLI.
Uses MemorySaver instead of RedisSaver: Studio manages its own persistence.
"""
from app.agents.job_description_agent import job_description_agent
from app.services.job_discovery_graph import build_job_discovery_graph
from app.services.profile_conversation_graph import build_profile_graph

# Studio manages its own persistence — compile without checkpointer
profile_conversation_graph, _ = build_profile_graph(no_checkpointer=True)
job_discovery_graph = build_job_discovery_graph()

__all__ = ["job_description_agent", "profile_conversation_graph", "job_discovery_graph"]
