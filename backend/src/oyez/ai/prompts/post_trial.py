"""Post-trial co-counsel prompt composition.

The Review page lets a student return to a closed case and chat with
co-counsel as a free-form Q&A. Pedagogically this is a different mode
from the in-trial co-counsel persona:

  * In-trial co-counsel nudges, never solves — the student must produce
    explanations themselves under pressure.
  * Post-trial co-counsel solves, explains, and unpacks freely. The
    pressure is gone, so withholding answers just frustrates the
    student. The transcript is the artifact under discussion.

Like the in-trial flow, the route owns the session's ``chat_log`` and
this module only constructs the transient user turn (the student's
current question). The persisted form (question + answer) is appended
to ``chat_log`` after the call returns via
``Session.append_post_trial_to_chat`` so subsequent questions in the
same conversation see prior turns.
"""
from __future__ import annotations

from oyez.ai.base import ChatMessage
from oyez.ai.prompts._loader import fill


def build_post_trial_co_counsel_system(*, subject: str, topic: str) -> str:
    """Stable system instruction for the post-trial co-counsel persona.

    Different prompt file (and therefore different system instruction)
    from the in-trial co-counsel persona — see the module docstring for
    why the two modes diverge.
    """
    return fill(
        "post_trial_co_counsel_system",
        subject=subject,
        topic=topic,
    )


def build_post_trial_user_turn(*, question: str) -> ChatMessage:
    """Wrap the student's free-form question as the transient user turn.

    A lightweight prefix flags this as a post-trial aside so the model
    can tell it apart from anything in the in-trial transcript that
    might otherwise look like a defense statement (especially since the
    transcript and ``chat_log`` already contain plenty of defense turns
    from the trial proper).
    """
    return ChatMessage(
        role="user",
        content=f"(Post-trial review — defense asks Co-Counsel:)\n{question}",
    )
