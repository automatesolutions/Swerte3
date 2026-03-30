from enum import Enum

from pydantic import BaseModel, Field


class DrawSessionEnum(str, Enum):
    nine_am = "9am"
    four_pm = "4pm"
    nine_pm = "9pm"


class PredictQuery(BaseModel):
    session: DrawSessionEnum = Field(..., description="Draw time bucket")
