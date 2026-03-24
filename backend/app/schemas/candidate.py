from typing import Optional
from pydantic import BaseModel, Field


class CandidateProfile(BaseModel):
    # Hard criteria
    job_title_target: str = Field(description="Titre de poste visé")
    experience_years: Optional[int] = Field(None, description="Années d'expérience")
    skills: list[str] = Field(default_factory=list, description="Compétences techniques. Max 10.")
    location_pref: Optional[str] = Field(None, description="Ville ou région préférée")
    remote_pref: Optional[str] = Field(None, description="'remote', 'hybrid', 'onsite', ou None")
    salary_min: Optional[int] = Field(None, description="Salaire minimum annuel en euros")
    contract_type: Optional[str] = Field(None, description="'cdi', 'cdd', 'freelance', 'any'")

    # Soft fit
    aspirations: Optional[str] = Field(None, description="Ce que le candidat veut atteindre")
    values: list[str] = Field(default_factory=list, description="Valeurs importantes: autonomy, impact...")
    preferred_sector: list[str] = Field(default_factory=list, description="Secteurs d'intérêt")
    preferred_team_size: Optional[str] = Field(None, description="'startup', 'mid', 'large'")
    dislikes: Optional[str] = Field(None, description="Ce que le candidat veut éviter")

    # Narrative
    summary: str = Field(default="", description="Résumé narratif du profil")

    # Meta
    completion_score: float = Field(default=0.0, description="filled_fields / len(INFO_GRID)")


# Priority-ordered — gap_analyzer works top-to-bottom
INFO_GRID = [
    "job_title_target",
    "experience_years",
    "skills",
    "remote_pref",
    "location_pref",
    "salary_min",
    "contract_type",
    "aspirations",
    "values",
    "preferred_sector",
    "preferred_team_size",
    "dislikes",
]

QUESTION_CONFIG: dict[str, dict] = {
    "job_title_target": {
        "question": "Quel type de poste recherchez-vous ?",
        "skippable": False,
    },
    "experience_years": {
        "question": "Combien d'années d'expérience avez-vous ?",
        "skippable": False,
    },
    "skills": {
        "question": "Quelles sont vos principales compétences techniques ?",
        "skippable": False,
    },
    "remote_pref": {
        "question": "Préférez-vous travailler en remote, hybride ou présentiel ?",
        "skippable": False,
    },
    "location_pref": {
        "question": "Dans quelle ville ou région souhaitez-vous travailler ?",
        "skippable": True,
    },
    "salary_min": {
        "question": "Quelle est votre fourchette de salaire minimum souhaitée ?",
        "skippable": True,
    },
    "contract_type": {
        "question": "Recherchez-vous un CDI, CDD, ou êtes-vous ouvert au freelance ?",
        "skippable": True,
    },
    "aspirations": {
        "question": "Qu'est-ce qui vous attire le plus dans votre prochain poste ?",
        "skippable": True,
    },
    "values": {
        "question": "Quelles valeurs sont importantes pour vous dans votre environnement de travail ? (ex: autonomie, impact, apprentissage)",
        "skippable": True,
    },
    "preferred_sector": {
        "question": "Y a-t-il des secteurs ou types d'entreprises qui vous attirent particulièrement ?",
        "skippable": True,
    },
    "preferred_team_size": {
        "question": "Préférez-vous travailler dans une startup, une PME ou un grand groupe ?",
        "skippable": True,
    },
    "dislikes": {
        "question": "Y a-t-il des environnements ou situations que vous voulez absolument éviter ?",
        "skippable": True,
    },
}


def compute_completion_score(profile: CandidateProfile) -> float:
    """filled_fields / len(INFO_GRID), unweighted."""
    filled = 0
    for field in INFO_GRID:
        value = getattr(profile, field)
        if value is not None and value != [] and value != "":
            filled += 1
    return round(filled / len(INFO_GRID), 2)
