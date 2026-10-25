"""Typed schemas and helpers for approval-gated server Missions."""
from typing import Annotated, List

from pydantic import Field, field_validator

from .schema import BuildPlan, SchemaError, Strict, validate


class MissionBreakdown(BuildPlan):
    """Ordered goal list plus the first milestone's ordinary safe build plan."""
    milestones: Annotated[List[Annotated[str, Field(min_length=1, max_length=300)]], Field(min_length=3, max_length=6)]

    @field_validator("milestones")
    @classmethod
    def _nonblank_goals(cls, goals):
        if any(not goal.strip() for goal in goals): raise ValueError("milestone goals must not be blank")
        return goals


def parse_breakdown(text):
    """Validate model output as an ordered 3–6 milestone plan with safe typed actions."""
    try:
        return validate(text, MissionBreakdown)
    except SchemaError as exc:
        raise ValueError(str(exc)) from exc
