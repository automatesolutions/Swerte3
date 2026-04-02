from pydantic import BaseModel, Field


class OTPRequest(BaseModel):
    phone: str = Field(
        ...,
        min_length=8,
        max_length=32,
        examples=["09171234567"],
        description="PH mobile; digits only or with spaces/dashes ok.",
    )


class OTPVerify(BaseModel):
    phone: str
    code: str = Field(..., min_length=4, max_length=8)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str
