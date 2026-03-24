from app.schemas.candidate import CandidateProfile, INFO_GRID, QUESTION_CONFIG, compute_completion_score


def test_completion_score_only_required_field():
    # job_title_target is filled (1/12), all others None/empty
    profile = CandidateProfile(job_title_target="Dev", summary="")
    score = compute_completion_score(profile)
    assert score == round(1 / 12, 2)


def test_completion_score_partial():
    profile = CandidateProfile(
        job_title_target="Dev",
        skills=["Python"],
        remote_pref="remote",
        summary=""
    )
    score = compute_completion_score(profile)
    assert 0.0 < score < 1.0


def test_completion_score_full():
    profile = CandidateProfile(
        job_title_target="Dev", experience_years=5, skills=["Python"],
        location_pref="Paris", remote_pref="hybrid", salary_min=60000,
        contract_type="cdi", aspirations="Lead a team", values=["autonomy"],
        preferred_sector=["tech"], preferred_team_size="startup",
        dislikes="micromanagement", summary="Senior dev"
    )
    assert compute_completion_score(profile) == 1.0


def test_info_grid_matches_profile_fields():
    profile_fields = set(CandidateProfile.model_fields.keys()) - {"summary", "completion_score"}
    for field in INFO_GRID:
        assert field in profile_fields, f"{field} in INFO_GRID not in CandidateProfile"


def test_question_config_covers_grid():
    for field in INFO_GRID:
        assert field in QUESTION_CONFIG, f"{field} missing from QUESTION_CONFIG"
