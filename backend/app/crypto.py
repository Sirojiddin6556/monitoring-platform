import os
import base64
from cryptography.fernet import Fernet, InvalidToken

_key_env = os.getenv("FIELD_ENCRYPTION_KEY", "").strip()

if _key_env:
    try:
        _fernet = Fernet(_key_env.encode() if not isinstance(_key_env, bytes) else _key_env)
    except Exception as exc:
        raise RuntimeError(
            f"FIELD_ENCRYPTION_KEY is invalid (must be a 32-byte URL-safe base64 key). "
            f"Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\". "
            f"Error: {exc}"
        )
else:
    _fernet = None


def encrypt_field(value: str | None) -> str | None:
    """Шифрует строку перед сохранением в БД. Возвращает None если value пустое."""
    if not value:
        return value
    if _fernet is None:
        return value
    return _fernet.encrypt(value.encode()).decode()


def decrypt_field(value: str | None) -> str | None:
    """Расшифровывает строку из БД. Возвращает значение как есть если ключ не задан или значение не зашифровано."""
    if not value:
        return value
    if _fernet is None:
        return value
    try:
        return _fernet.decrypt(value.encode()).decode()
    except (InvalidToken, Exception):
        # Значение не зашифровано (например, старые записи до включения шифрования)
        return value
