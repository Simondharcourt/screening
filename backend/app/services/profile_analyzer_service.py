import logging
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langfuse import observe
from app.core.config import settings
from app.schemas.candidate import CandidateProfile, compute_completion_score

logger = logging.getLogger(__name__)


@observe(name="analyze_cv")
def analyze_cv(cv_text: str) -> CandidateProfile:
    """
    Analyzes CV text and returns a pre-filled CandidateProfile.
    Only fills fields confidently derivable from the CV — leaves the rest None.
    """
    try:
        llm = ChatAnthropic(
            model=settings.LLM_MODEL,
            temperature=0,
            max_tokens=1024,
            api_key=settings.ANTHROPIC_API_KEY
        )
        structured_llm = llm.with_structured_output(CandidateProfile)

        prompt = ChatPromptTemplate.from_messages([
            ("system",
             "Tu es un expert RH. Analyse ce CV et extrais un profil structuré. "
             "Ne remplis que les champs dont tu es sûr d'après le CV. "
             "Laisse les champs manquants à None — ils seront demandés au candidat. "
             "Le champ summary doit être un résumé narratif de 2-3 phrases du parcours."),
            ("human", "CV du candidat:\n\n{cv_text}"),
        ])

        chain = prompt | structured_llm
        logger.info(f"[analyze_cv] model={settings.LLM_MODEL}, input={len(cv_text[:8000])} chars")
        result = chain.invoke({"cv_text": cv_text[:8000]})
        result.completion_score = compute_completion_score(result)
        logger.info(f"[analyze_cv] ✓ {result.job_title_target}, score={result.completion_score}")
        return result

    except Exception as e:
        logger.error(f"CV analysis failed: {e}")
        return CandidateProfile(
            job_title_target="Professionnel",
            summary="Profil en cours d'analyse.",
        )
