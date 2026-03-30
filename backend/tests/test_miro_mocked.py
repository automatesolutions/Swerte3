from unittest.mock import MagicMock, patch

from app.ml.miro import run_miro_swertres


def test_run_miro_swertres_with_mock_llm():
    models = {
        "XGBoost": {"digits": [1, 2, 3], "note": "t"},
        "Markov": {"digits": [4, 5, 6], "note": "t"},
    }
    fake = MagicMock()
    fake.chat_json.side_effect = [
        {"agents": [{"model": "XGBoost", "candidate_triple": [1, 1, 1]}]},
        {"final_digits": [7, 8, 9]},
    ]
    with patch("app.ml.miro.LLMClient", return_value=fake):
        out = run_miro_swertres("9am", models)
    assert out == [7, 8, 9]
