from typing import List, Dict, Any, TypedDict, Optional
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.pydantic_v1 import BaseModel as LangchainBaseModel, Field
from langchain_core.messages import BaseMessage, SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

# --- 1. Define State & Schemas ---

class ExtractedProfile(LangchainBaseModel):
    skills: List[str] = Field(default_factory=list, description="List of technical or soft skills extracted.")
    experience_years: Optional[int] = Field(None, description="Total years of professional experience, if known.")
    preferred_role: Optional[str] = Field(None, description="The job title or role the candidate is looking for.")
    location_pref: Optional[str] = Field(None, description="Location preference (Remote, city name, etc).")
    summary: Optional[str] = Field(None, description="A 2-3 sentence summary of the candidate's profile.")

class CoachAgentState(TypedDict):
    messages: List[BaseMessage]
    extracted_profile: ExtractedProfile

# --- 2. Define Nodes ---

def extraction_node(state: CoachAgentState) -> Dict[str, Any]:
    """Reads the conversation history so far and attempts to update the extracted profile."""
    # We only need to run this if there are messages. We use a separate LLM call to parse.
    llm = ChatAnthropic(model="claude-3-5-sonnet-latest", temperature=0)
    structured_llm = llm.with_structured_output(ExtractedProfile)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert HR data extractor. Based on the following conversation history, "
                   "extract and update the candidate's profile. "
                   "If the user shares new skills, experience, or preferences, include them. "
                   "If they haven't mentioned something, leave it empty or null. "
                   "Current profile state:\n{current_profile}"),
        MessagesPlaceholder(variable_name="messages")
    ])
    
    # We serialize the current profile to feed it as context
    current_profile_str = state.get("extracted_profile", ExtractedProfile()).json()
    
    chain = prompt | structured_llm
    response = chain.invoke({
        "messages": state["messages"],
        "current_profile": current_profile_str
    })
    
    return {"extracted_profile": response}

def chat_node(state: CoachAgentState) -> Dict[str, Any]:
    """Generates the next response to the user based on missing profile data."""
    llm = ChatAnthropic(model="claude-3-5-sonnet-latest", temperature=0.7)
    
    # We serialize the extracted profile to let the LLM know what it still needs to ask
    current_profile = state.get("extracted_profile", ExtractedProfile())
    
    missing_fields = []
    if not current_profile.skills: missing_fields.append("compétences principales")
    if current_profile.experience_years is None: missing_fields.append("années d'expérience")
    if not current_profile.preferred_role: missing_fields.append("poste recherché")

    system_prompt = (
        "Tu es un 'Coach Carrière' IA amical et professionnel, conçu pour aider les candidats à construire leur profil. "
        "Ton objectif est de mener une conversation naturelle pour extraire leurs compétences, années d'expérience, "
        "et le type de poste qu'ils recherchent. "
        "Sois concis, pose UNE SEULE question à la fois. Ne sois pas trop formel. "
    )
    
    if missing_fields:
        system_prompt += f"\n\nTu dois encore découvrir les informations suivantes : {', '.join(missing_fields)}. "
        system_prompt += "Oriente subtilement la conversation pour obtenir ces infos."
    else:
        system_prompt += "\n\nTu as toutes les informations nécessaires ! Remercie le candidat chaleureusement et dis-lui que son profil est complet."

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="messages")
    ])
    
    chain = prompt | llm
    response = chain.invoke({"messages": state["messages"]})
    
    return {"messages": [response]} # Append the new AI message to the state list

# --- 3. Build Graph ---

def build_coach_agent() -> StateGraph:
    workflow = StateGraph(CoachAgentState)
    
    # Add nodes
    workflow.add_node("chat", chat_node)
    workflow.add_node("extract", extraction_node)
    
    # The flow goes: Human -> chat_node -> extract_node -> END (waiting for human again)
    workflow.set_entry_point("chat")
    workflow.add_edge("chat", "extract")
    workflow.add_edge("extract", END)
    
    # Set up memory saver checkpointer
    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)

# Keep a single instance in memory
coach_agent = build_coach_agent()
