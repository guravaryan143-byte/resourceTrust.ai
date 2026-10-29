from app.core.security import hash_password, verify_password, create_access_token, decode_token
import pytest


def test_password_hashing():
    hashed = hash_password("correct-horse-battery")
    assert hashed != "correct-horse-battery"
    assert verify_password("correct-horse-battery", hashed)
    assert not verify_password("wrong-password", hashed)


def test_jwt_roundtrip():
    token = create_access_token("42")
    assert decode_token(token) == "42"


def test_password_too_short_raises():
    with pytest.raises(ValueError, match="at least 10 characters"):
        hash_password("short")


def test_password_exactly_ten_chars_accepted():
    hashed = hash_password("0123456789")
    assert verify_password("0123456789", hashed)


def test_token_wrong_secret_returns_none():
    """Decoding a token signed with a different secret must return None."""
    from jose import jwt
    bad_token = jwt.encode({"sub": "99"}, "wrong-secret", algorithm="HS256")
    assert decode_token(bad_token) is None


def test_token_missing_sub_returns_none():
    """A valid JWT with no 'sub' claim should return None."""
    from app.core.config import settings
    from jose import jwt
    from datetime import datetime, timedelta, timezone

    expires = datetime.now(timezone.utc) + timedelta(minutes=5)
    token = jwt.encode({"exp": expires}, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    assert decode_token(token) is None


def test_decode_garbage_string_returns_none():
    assert decode_token("not.a.jwt.at.all") is None
