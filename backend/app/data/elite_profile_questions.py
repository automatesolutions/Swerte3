"""Progressive Elite profiling question bank (ask one at a time per Elite access)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class ProfileOption:
    value: str
    label_en: str
    label_tl: str


@dataclass(frozen=True)
class EliteProfileQuestionDef:
    id: str
    order: int
    prompt_en: str
    prompt_tl: str
    kind: Literal["select", "text"]
    options: tuple[ProfileOption, ...] | None = None
    repeatable: bool = False
    placeholder_en: str | None = None
    placeholder_tl: str | None = None


# Primary questions — asked once in order (first unanswered each Elite visit).
PRIMARY_QUESTIONS: tuple[EliteProfileQuestionDef, ...] = (
    EliteProfileQuestionDef(
        id="age_range",
        order=1,
        prompt_en="What is your age range?",
        prompt_tl="Ano ang iyong age range?",
        kind="select",
        options=(
            ProfileOption("18_24", "18–24", "18–24"),
            ProfileOption("25_34", "25–34", "25–34"),
            ProfileOption("35_44", "35–44", "35–44"),
            ProfileOption("45_54", "45–54", "45–54"),
            ProfileOption("55_plus", "55+", "55+"),
            ProfileOption("prefer_not", "Prefer not to say", "Ayaw sabihin"),
        ),
    ),
    EliteProfileQuestionDef(
        id="city_region",
        order=2,
        prompt_en="Which city or region are you usually in?",
        prompt_tl="Saang lungsod o rehiyon ka karaniwang nakatira?",
        kind="text",
        placeholder_en="e.g. Cebu City, NCR, Davao",
        placeholder_tl="hal. Cebu City, NCR, Davao",
    ),
    EliteProfileQuestionDef(
        id="play_frequency",
        order=3,
        prompt_en="How often do you check or play number games?",
        prompt_tl="Gaano kadalas kang tumingin o maglaro ng mga numero?",
        kind="select",
        options=(
            ProfileOption("daily", "Almost every day", "Halos araw-araw"),
            ProfileOption("few_week", "A few times a week", "Ilang beses sa isang linggo"),
            ProfileOption("weekly", "About once a week", "Mga isang beses sa linggo"),
            ProfileOption("rare", "Rarely", "Bihira"),
        ),
    ),
    EliteProfileQuestionDef(
        id="primary_motivation",
        order=4,
        prompt_en="What brings you to Elite predictions most?",
        prompt_tl="Ano ang pinakadahilan kung bakit ginagamit mo ang Elite?",
        kind="select",
        options=(
            ProfileOption("fun", "Fun / entertainment", "Libangan"),
            ProfileOption("patterns", "Spotting patterns", "Hanap ng pattern"),
            ProfileOption("habit", "Daily habit / routine", "Araw-araw na gawi"),
            ProfileOption("social", "Friends or family also play", "Kasama ang barkada/pamilya"),
            ProfileOption("curious", "Just curious about AI picks", "Curious sa AI picks"),
        ),
    ),
    EliteProfileQuestionDef(
        id="lucky_ritual",
        order=5,
        prompt_en="Do you have a lucky ritual before picking numbers?",
        prompt_tl="May lucky ritual ka ba bago pumili ng numero?",
        kind="select",
        options=(
            ProfileOption("yes", "Yes, often", "Oo, madalas"),
            ProfileOption("sometimes", "Sometimes", "Minsan"),
            ProfileOption("no", "No", "Wala"),
        ),
    ),
    EliteProfileQuestionDef(
        id="years_playing",
        order=6,
        prompt_en="How long have you been following draws like this?",
        prompt_tl="Gaano ka na katagal na sumusubaybay sa ganitong draw?",
        kind="select",
        options=(
            ProfileOption("under_1", "Less than 1 year", "Wala pang 1 taon"),
            ProfileOption("1_3", "1–3 years", "1–3 taon"),
            ProfileOption("3_10", "3–10 years", "3–10 taon"),
            ProfileOption("10_plus", "More than 10 years", "Higit 10 taon"),
        ),
    ),
    EliteProfileQuestionDef(
        id="preferred_draw_time",
        order=7,
        prompt_en="Which draw time do you care about most?",
        prompt_tl="Aling oras ng draw ang pinaka-importante sa iyo?",
        kind="select",
        options=(
            ProfileOption("9am", "9 AM", "9 AM"),
            ProfileOption("4pm", "4 PM", "4 PM"),
            ProfileOption("9pm", "9 PM", "9 PM"),
            ProfileOption("all", "All sessions equally", "Lahat pantay"),
        ),
    ),
    EliteProfileQuestionDef(
        id="occupation_category",
        order=8,
        prompt_en="Which best describes your work or daily role?",
        prompt_tl="Alin ang pinakamalapit sa trabaho o pang-araw-araw mong gawain?",
        kind="select",
        options=(
            ProfileOption("student", "Student", "Estudyante"),
            ProfileOption("employed", "Employed", "May trabaho"),
            ProfileOption("self_employed", "Self-employed / business", "Sariling negosyo"),
            ProfileOption("homemaker", "Homemaker / caregiver", "Bahay / tagapag-alaga"),
            ProfileOption("other", "Other", "Iba pa"),
        ),
    ),
    EliteProfileQuestionDef(
        id="how_heard",
        order=9,
        prompt_en="How did you hear about this app?",
        prompt_tl="Paano mo nalaman ang app na ito?",
        kind="select",
        options=(
            ProfileOption("friend", "Friend or family", "Kaibigan o pamilya"),
            ProfileOption("social", "Social media", "Social media"),
            ProfileOption("search", "Search / store listing", "Search o Play Store"),
            ProfileOption("other", "Other", "Iba pa"),
        ),
    ),
    EliteProfileQuestionDef(
        id="gender",
        order=10,
        prompt_en="Gender (optional — helps us understand usage fairly)",
        prompt_tl="Kasarian (opsyonal — tumutulong sa patas na pag-unawa sa paggamit)",
        kind="select",
        options=(
            ProfileOption("female", "Female", "Babae"),
            ProfileOption("male", "Male", "Lalaki"),
            ProfileOption("non_binary", "Non-binary / other", "Non-binary / iba"),
            ProfileOption("prefer_not", "Prefer not to say", "Ayaw sabihin"),
        ),
    ),
)

# Repeatable — one per visit after primary set is complete (rotates by oldest answer).
REPEATABLE_QUESTIONS: tuple[EliteProfileQuestionDef, ...] = (
    EliteProfileQuestionDef(
        id="mood_today",
        order=101,
        prompt_en="How are you feeling about today's picks?",
        prompt_tl="Ano ang pakiramdam mo sa picks ngayon?",
        kind="select",
        repeatable=True,
        options=(
            ProfileOption("excited", "Excited", "Excited"),
            ProfileOption("calm", "Calm", "Kalmado"),
            ProfileOption("unsure", "Unsure", "Hindi sigurado"),
            ProfileOption("skip", "Rather not say", "Ayaw sabihin"),
        ),
    ),
    EliteProfileQuestionDef(
        id="confidence_level",
        order=102,
        prompt_en="How confident do you feel right now (1 = low, 5 = high)?",
        prompt_tl="Gaano ka kakumpiyansa ngayon (1 = mababa, 5 = mataas)?",
        kind="select",
        repeatable=True,
        options=tuple(
            ProfileOption(str(i), str(i), str(i)) for i in range(1, 6)
        ),
    ),
    EliteProfileQuestionDef(
        id="followed_last_prediction",
        order=103,
        prompt_en="Did you follow a prediction from this app recently?",
        prompt_tl="Sinunod mo ba ang hula mula sa app kamakailan?",
        kind="select",
        repeatable=True,
        options=(
            ProfileOption("yes", "Yes", "Oo"),
            ProfileOption("no", "No", "Hindi"),
            ProfileOption("partly", "Partly", "Bahagya"),
        ),
    ),
)

ALL_QUESTIONS: dict[str, EliteProfileQuestionDef] = {
    q.id: q for q in (*PRIMARY_QUESTIONS, *REPEATABLE_QUESTIONS)
}
