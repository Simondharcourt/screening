import logging
from typing import Optional
from pydantic import BaseModel, Field
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langfuse import observe
from app.core.config import settings

logger = logging.getLogger(__name__)


class CandidateProfile(BaseModel):
    job_title_target: str = Field(description="Titre de poste visé")
    experience_years: Optional[int] = Field(None, description="Années d'expérience totales")
    skills: list[str] = Field(default_factory=list, description="Compétences techniques identifiées. Max 10.")
    location_pref: Optional[str] = Field(None, description="Ville ou région préférée. None si non mentionné.")
    remote_pref: Optional[str] = Field(None, description="'remote', 'hybrid', 'onsite', ou None si non mentionné.")
    salary_min: Optional[int] = Field(None, description="Salaire minimum souhaité en euros annuels. None si non mentionné.")
    summary: str = Field(description="Résumé du profil en 2-3 phrases")
    ambiguities: list[str] = Field(
        default_factory=list,
        description=(
            "Liste de questions précises à poser au candidat pour clarifier des informations "
            "manquantes ou ambiguës dans le CV. Max 3 questions. Exemples: "
            "'Recherchez-vous un poste en remote ou en présentiel ?', "
            "'Quelle est votre fourchette de salaire souhaitée ?', "
            "'Votre prochain poste est-il en CDI ou vous êtes ouvert au freelance ?'"
        )
    )


@observe(name="analyze_cv")
def analyze_cv(cv_text: str) -> CandidateProfile:
    """
    Analyzes CV text and returns a structured profile + clarifying questions.
    Falls back to a minimal profile on LLM failure.
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
             "Pour les champs manquants, génère des questions courtes et directes à poser au candidat. "
             "Maximum 3 questions, uniquement pour les informations vraiment importantes (remote/présentiel, salaire, type de contrat)."),
            ("human", "CV du candidat:\n\n{cv_text}"),
        ])

        chain = prompt | structured_llm
        logger.info(f"[LLM #1/12] analyze_cv → model={settings.LLM_MODEL}, input={len(cv_text[:8000])} chars")
        result = chain.invoke({"cv_text": cv_text[:8000]})
        logger.info(f"[LLM #1/12] ✓ profile: {result.job_title_target}, {len(result.skills)} skills, {len(result.ambiguities)} questions")
        return result

    except Exception as e:
        logger.error(f"CV analysis LLM call failed: {e}")
        return CandidateProfile(
            job_title_target="Professionnel",
            skills=[],
            summary="Profil en cours d'analyse.",
            ambiguities=["Quel type de poste recherchez-vous ?"]
        )
