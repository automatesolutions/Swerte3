from app.ml.markov_model import predict_next_triple


def test_markov_runs_with_short_history():
    t = predict_next_triple([(1, 2, 3)], seed=1)
    assert len(t) == 3
    assert all(0 <= x <= 9 for x in t)


def test_markov_follows_chain():
    hist = [(0, 0, 0), (1, 1, 1), (2, 2, 2)]
    t = predict_next_triple(hist, seed=42)
    assert len(t) == 3
