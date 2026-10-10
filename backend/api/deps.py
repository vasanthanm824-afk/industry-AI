"""
FastAPI Security & Authentication Dependencies
Protects administrative routes with JWT bearer token verification.
"""

from typing import Optional
from fastapi import Depends, HTTPException, Query, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from backend.db.models.manager import Manager
from backend.db.session import get_db
from backend.services.auth_service import AuthService

security = HTTPBearer(auto_error=False)


def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(db_session=db)


def get_current_manager(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    token: Optional[str] = Query(None),
    auth_service: AuthService = Depends(get_auth_service),
) -> Manager:
    """
    Validates JWT token from 'Authorization: Bearer <token>' header or '?token=' query parameter.
    """
    jwt_token = None
    if credentials:
        jwt_token = credentials.credentials
    elif token:
        jwt_token = token

    if not jwt_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in with safety manager credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = auth_service.verify_token(jwt_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token expired or invalid. Please re-authenticate.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username = payload.get("sub")
    manager = auth_service.get_manager_by_username(username)
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated manager account no longer exists.",
        )

    return manager
