from unittest.mock import patch, MagicMock
from app.schemas.candidate import CandidateProfile
from app.services.profile_conversation_graph import (
    gap_analyzer_node,
    answer_processor_node,
    finalize_node,
)

BASE_STATE = {
    "session_id": "test-123",
    "profile": CandidateProfile(job_title_target="Dev", summary="").model_dump(),
    "qa_history": [],
    "current_question": None,
    "is_complete": False,
}

def test_gap_analyzer_returns_question_when_gaps_exist():
    with patch("app.services.profile_conversation_graph.ChatAnthropic") as mock_llm:
        mock_llm.return_value.with_structured_output.return_value.invoke.return_value = MagicMock(
            question="Combien d'années d'expérience avez-vous ?", is_complete=False
        )
        result = gap_analyzer_node(BASE_STATE)
    assert result["current_question"] is not None
    assert result["is_complete"] is False

def test_gap_analyzer_sets_complete_when_no_gaps():
    full_profile = CandidateProfile(
        job_title_target="Dev", experience_years=5, skills=["Python"],
        remote_pref="remote", location_pref="Paris", salary_min=60000,
        contract_type="cdi", aspirations="Lead", values=["autonomy"],
        preferred_sector=["tech"], preferred_team_size="startup",
        dislikes="micromanagement", summary="Senior dev"
    )
    state = {**BASE_STATE, "profile": full_profile.model_dump()}
    with patch("app.services.profile_conversation_graph.ChatAnthropic") as mock_llm:
        mock_llm.return_value.with_structured_output.return_value.invoke.return_value = MagicMock(
            question=None, is_complete=True
        )
        result = gap_analyzer_node(state)
    assert result["is_complete"] is True

def test_answer_processor_updates_profile():
    state = {
        **BASE_STATE,
        "current_question": "Combien d'années d'expérience ?",
    }
    with patch("app.services.profile_conversation_graph.ChatAnthropic") as mock_llm:
        mock_llm.return_value.with_structured_output.return_value.invoke.return_value = MagicMock(
            structured_updates={"experience_years": 5},
            narrative_addition="5 ans d'expérience Python."
        )
        with patch("app.services.profile_conversation_graph.interrupt", return_value="5 ans"), \
             patch("app.services.profile_conversation_graph._sync_profile_to_supabase"):
            result = answer_processor_node(state)
    assert result["profile"]["experience_years"] == 5
    assert len(result["qa_history"]) == 1
