from core import evaluate


def _links(*targets):
    return [{"target_id": t} for t in targets]


QUERY_IDS = ["q1", "q2", "q3", "d1"]
TRUTH = {"q1": "r1", "q2": "r2", "q3": "r3", "d1": None}
GROUPS = {
    "q1": ["blur", "rotate"],
    "q2": "blur",
    "q3": ["rotate"],
    "d1": ["blur"],
}
LINKS = [
    _links("r1", "r9"),  # found, plus one wrong link
    _links("r2"),  # found
    _links("r7"),  # missed
    _links("r1"),  # distractor: wrong
]


def test_overall_metrics():
    result = evaluate.evaluate(QUERY_IDS, LINKS, TRUTH)
    overall = result["overall"]
    assert overall["links"] == 5
    assert overall["correct"] == 2
    assert overall["precision"] == 0.4
    assert overall["recall"] == round(2 / 3, 4)
    assert result["misses"] == {"__all__": ["q3"]}


def test_per_group_with_list_values():
    result = evaluate.evaluate(QUERY_IDS, LINKS, TRUTH, groups=GROUPS)
    blur = result["per_group"]["blur"]
    rotate = result["per_group"]["rotate"]
    assert blur["with_truth"] == 2 and blur["found"] == 2
    assert blur["links"] == 4 and blur["correct"] == 2
    assert rotate["with_truth"] == 2 and rotate["found"] == 1
    assert result["misses"]["rotate"] == ["q3"]


def test_reverse_link_counts_as_correct():
    truth = {"child": "parent", "parent": None}
    result = evaluate.evaluate(
        ["child", "parent"], [_links("parent"), _links("child")], truth
    )
    assert result["overall"]["precision"] == 1.0
    assert result["overall"]["recall"] == 1.0


def test_no_links_gives_zero_metrics():
    result = evaluate.evaluate(["q1"], [[]], {"q1": "r1"})
    assert result["overall"]["precision"] == 0.0
    assert result["overall"]["f1"] == 0.0


def test_signal_by_group_matrix():
    full = evaluate.evaluate(QUERY_IDS, LINKS, TRUTH, groups=GROUPS)
    nothing = evaluate.evaluate(QUERY_IDS, [[], [], [], []], TRUTH, groups=GROUPS)
    grid = evaluate.signal_by_group_matrix({"rule": full, "phash": nothing})
    assert grid["rows"] == ["rule", "phash"]
    assert grid["groups"] == ["blur", "rotate"]
    assert grid["recall"] == [[1.0, 0.5], [0.0, 0.0]]
    assert grid["counts"] == [2, 2]
