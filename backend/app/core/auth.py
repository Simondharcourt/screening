from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from dataclasses import dataclass
from app.core.config import settings
from app.core.database import supabase

bearer_scheme = HTTPBearer(auto_error=False)

@dataclass
class AuthUser:
    id: str
    email: str
    role: str | None

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthUser:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
        
    resp = supabase.table("users").select("role").eq("id", user_id).maybe_single().execute()
    return AuthUser(
        id=user_id, 
        email=payload.get("email", ""), 
        role=resp.data["role"] if resp.data else None
    )

def get_current_recruiter(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role != "recruiter":
        raise HTTPException(status_code=403, detail="Recruiter access required")
    return user

def get_current_candidate(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role != "candidate":
        raise HTTPException(status_code=403, detail="Candidate access required")
    return user
