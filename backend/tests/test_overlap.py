from app.ml.council import multiset_jaccard, overlap_summary


def test_multiset_jaccard():
    assert multiset_jaccard([1, 1, 2], [1, 2, 2]) > 0
    assert multiset_jaccard([1, 2, 3], [4, 5, 6]) == 0


def test_overlap_summary_structure():
    s = overlap_summary({"A": [1, 1, 2], "B": [1, 2, 3]})
    assert "pairs" in s and "digit_vote_histogram" in s
