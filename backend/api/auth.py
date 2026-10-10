"""
Authentication Router
Handles manager login, session token issuance, and profile verification.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.api.deps import get_current_manager
from backend.db.models.manager import Manager
from backend.db.session import get_db
from backend.services.auth_service import AuthService

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    manager: dict


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    auth_service = AuthService(db_session=db)
    manager = auth_service.authenticate_manager(req.username, req.password)
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    token = auth_service.create_access_token(manager)
    return {
        "access_token": token,
        "token_type": "bearer",
        "manager": manager.to_dict(),
    }


@router.get("/me")
def get_current_user_profile(manager: Manager = Depends(get_current_manager)):
    return {
        "authenticated": True,
        "manager": manager.to_dict(),
    }
