"""
Authentication dependency for CommerceIQ API using Firebase Admin SDK.
Verifies Firebase ID tokens (signatures, expiry, issuer, audience, subject/UID).
Fails closed if the Firebase Admin SDK is uninitialized or unconfigured.

NOTE ON SELLER AUTHORIZATION (TEMPORARY DEVELOPMENT SCOPE):
Currently, product creation requires verified authentication, and seller_id is
derived exclusively from the verified user UID. Seller-only role authorization
remains incomplete because the project currently lacks a server-controlled role
mechanism (e.g., Firebase custom claims or a database role table). This temporary
behavior MUST NOT be treated as production-ready.
"""
import os
from dataclasses import dataclass
from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer(auto_error=False)

@dataclass
class AuthenticatedUser:
    uid: str
    email: Optional[str] = None
    claims: Optional[Dict[str, Any]] = None

_firebase_app = None

def get_firebase_app():
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()

    if not project_id and not cred_path:
        return None

    try:
        import firebase_admin
        from firebase_admin import credentials

        if not firebase_admin._apps:
            if cred_path and os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                _firebase_app = firebase_admin.initialize_app(cred)
            elif project_id:
                _firebase_app = firebase_admin.initialize_app(options={"projectId": project_id})
            else:
                _firebase_app = firebase_admin.initialize_app()
        else:
            _firebase_app = firebase_admin.get_app()
        return _firebase_app
    except Exception:
        return None

def verify_firebase_id_token(token: str) -> AuthenticatedUser:
    """
    Verifies a Firebase ID token using Firebase Admin SDK.
    Validates RS256 signature, expiration, issuer, audience, and subject/UID.
    Fails closed if Firebase Admin SDK is not initialized or configured.
    """
    app = get_firebase_app()
    if app is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is not configured on the server. Set FIREBASE_PROJECT_ID or GOOGLE_APPLICATION_CREDENTIALS."
        )

    try:
        from firebase_admin import auth as firebase_auth
        decoded = firebase_auth.verify_id_token(token, app=app, check_revoked=False)
        uid = decoded.get("uid") or decoded.get("sub")
        if not uid or not isinstance(uid, str) or not uid.strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject/UID."
            )
        return AuthenticatedUser(
            uid=uid.strip(),
            email=decoded.get("email"),
            claims=decoded
        )
    except HTTPException:
        raise
    except Exception as exc:
        error_name = type(exc).__name__
        if "ExpiredIdTokenError" in error_name:
            detail = "Your login session has expired. Please log in again."
        elif "RevokedIdTokenError" in error_name:
            detail = "Your login session was revoked. Please log in again."
        elif "InvalidIdTokenError" in error_name:
            detail = "Invalid authorization token."
        else:
            detail = f"Authentication token verification failed: {error_name}"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail
        )

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> AuthenticatedUser:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Missing Bearer token."
        )
    return verify_firebase_id_token(credentials.credentials)

def get_current_seller(
    user: AuthenticatedUser = Depends(get_current_user)
) -> AuthenticatedUser:
    """
    TEMPORARY DEVELOPMENT SCOPE:
    Derives seller identity from verified user identity.
    Note: Full role gating remains incomplete pending server-managed role storage.
    """
    return user
