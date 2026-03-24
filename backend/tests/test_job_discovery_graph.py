from unittest.mock import patch, MagicMock
from app.services.job_discovery_graph import dedup_merge_node, enrich_jit_node

SAMPLE_JOBS = [
    {"id": "1", "title": "Dev Python", "description": "Short", "external_url": "https://wttj.co/1", "source": "wttj"},
    {"id": "2", "title": "Dev React", "description": "A" * 600, "external_url": "https://wttj.co/2", "source": "wttj"},
    {"id": "3", "title": "Dev Python", "description": "Short", "external_url": "https://wttj.co/1", "source": "wttj"},  # dup of id=1
]

def test_dedup_merge_removes_duplicates():
    state = {
        "algolia_jobs": [SAMPLE_JOBS[0], SAMPLE_JOBS[2]],  # same external_url
        "pgvector_jobs": [SAMPLE_JOBS[1]],
    }
    result = dedup_merge_node(state)
    ids = [j["id"] for j in result["merged_jobs"]]
    assert len(set(ids)) == len(ids), "Duplicate ids found"
    assert len(result["merged_jobs"]) == 2

def test_dedup_merge_keeps_top_15():
    many_jobs = [{"id": str(i), "title": f"Job {i}", "description": "x", "external_url": f"https://x.co/{i}", "source": "wttj"} for i in range(20)]
    state = {"algolia_jobs": many_jobs, "pgvector_jobs": []}
    result = dedup_merge_node(state)
    assert len(result["merged_jobs"]) <= 15

def test_enrich_jit_skips_long_descriptions():
    state = {
        "merged_jobs": [SAMPLE_JOBS[1]],  # description > 500 chars
        "profile": {"job_title_target": "Dev", "skills": [], "summary": "", "values": [], "preferred_sector": [], "completion_score": 0},
    }
    with patch("app.services.job_discovery_graph._scrape_job_description") as mock_scrape:
        result = enrich_jit_node(state)
    mock_scrape.assert_not_called()
    assert result["enriched_jobs"][0]["description"] == SAMPLE_JOBS[1]["description"]

def test_enrich_jit_scrapes_short_descriptions():
    state = {
        "merged_jobs": [SAMPLE_JOBS[0]],  # short description
        "profile": {"job_title_target": "Dev", "skills": [], "summary": "", "values": [], "preferred_sector": [], "completion_score": 0},
    }
    with patch("app.services.job_discovery_graph._scrape_job_description", return_value="Full description here " * 30) as mock_scrape:
        result = enrich_jit_node(state)
    mock_scrape.assert_called_once()
    assert len(result["enriched_jobs"][0]["description"]) > 500
