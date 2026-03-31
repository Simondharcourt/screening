import logging
from typing import List
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from langfuse import observe
from app.core.config import settings
from app.core.llm import get_llm

logger = logging.getLogger(__name__)


class CandidateSkills(BaseModel):
    job_title_target: str = Field(
        description="Le titre de poste visé par le candidat (ex: 'Développeur Vue.js', 'Data Engineer')"
    )
    technical_skills: List[str] = Field(
        description="Compétences techniques identifiées : langages, frameworks, outils. Max 8."
    )


@observe(name="extract_skills")
def extract_skills_from_profile(profile_text: str) -> List[str]:
    """
    Uses Claude to extract structured technical skills and target job title from a candidate profile.
    Returns a list of search terms to use as the Algolia query (job_title + top skills).
    Falls back to ["developpeur"] if extraction fails or profile is empty.
    """
    if not profile_text or not profile_text.strip():
        return ["developpeur"]

    try:
        llm = get_llm(max_tokens=256)
        structured_llm = llm.with_structured_output(CandidateSkills)

        prompt = ChatPromptTemplate.from_messages([
            ("system",
             "Tu es un expert RH. Analyse ce profil candidat et extrais le titre de poste visé "
             "et les compétences techniques clés. Sois précis et concis."),
            ("human", "Profil candidat:\n{profile_text}"),
        ])

        chain = prompt | structured_llm
        logger.info(f"[LLM #2/12] extract_skills → model={settings.LLM_MODEL}")
        result: CandidateSkills = chain.invoke({"profile_text": profile_text[:3000]})

        # Build Algolia query terms: job title first, then skills
        terms = [result.job_title_target] + result.technical_skills[:5]
        logger.info(f"[LLM #2/12] ✓ Algolia query: {terms}")
        return terms

    except Exception as e:
        logger.error(f"Skill extraction LLM call failed: {e}")
        return ["developpeur"]
