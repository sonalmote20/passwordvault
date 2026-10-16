
import os
import base64
import hashlib
import hmac
import secrets
import time
from functools import wraps

from flask import Flask, request, jsonify
from pymongo import MongoClient
from bson import ObjectId
from cryptography.fernet import Fernet, InvalidToken

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

MONGO_URI = os.environ["MONGO_URI"]
client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = client["secure_vault"]
settings = db["settings"]
credentials = db["credentials"]

# Demo sessions live only in backend memory.
# Restarting the backend invalidates every session.
sessions = {}
SESSION_SECONDS = 30 * 60


def derive_key(password, salt):
    """Derive an encryption key from the master password."""
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        600_000,
        dklen=32
    )
    return base64.urlsafe_b64encode(key)


def password_verifier(password, salt):
    """Create a separate, one-way master-password verifier."""
    return hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=2**14,
        r=8,
        p=1,
        dklen=32
    )


def valid_master_password(password):
    return isinstance(password, str) and len(password) >= 12


def json_error(message, status=400):
    return jsonify({"error": message}), status


def require_session(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        token = request.headers.get("X-Vault-Token", "")
        session = sessions.get(token)

        if not session:
            return json_error("Vault locked. Please unlock it again.", 401)

        if session["expires"] < time.time():
            sessions.pop(token, None)
            return json_error("Session expired. Please unlock again.", 401)

        session["expires"] = time.time() + SESSION_SECONDS
        return function(*args, **kwargs)

    return wrapper


def get_session():
    token = request.headers.get("X-Vault-Token", "")
    return sessions.get(token)


@app.get("/api/status")
def status():
    try:
        client.admin.command("ping")
        initialized = settings.find_one({"_id": "master"}) is not None
        return jsonify({"initialized": initialized})
    except Exception:
        app.logger.exception("Database health check failed")
        return json_error("Database unavailable.", 503)


@app.post("/api/setup")
def setup():
    data = request.get_json(silent=True) or {}
    password = data.get("master_password")

    if not valid_master_password(password):
        return json_error("Master password must be at least 12 characters.")

    try:
        if settings.find_one({"_id": "master"}):
            return json_error("Vault already exists. Please unlock it.", 409)

        salt = secrets.token_bytes(16)
        verifier = password_verifier(password, salt)

        settings.insert_one({
            "_id": "master",
            "salt": base64.b64encode(salt).decode("ascii"),
            "verifier": base64.b64encode(verifier).decode("ascii")
        })

        token = secrets.token_urlsafe(32)
        sessions[token] = {
            "key": derive_key(password, salt),
            "expires": time.time() + SESSION_SECONDS
        }
        return jsonify({"token": token}), 201

    except Exception:
        app.logger.exception("Vault setup failed")
        return json_error("Unable to create vault.", 500)


@app.post("/api/unlock")
def unlock():
    data = request.get_json(silent=True) or {}
    password = data.get("master_password")

    if not isinstance(password, str) or not password:
        return json_error("Enter your master password.")

    try:
        record = settings.find_one({"_id": "master"})
        if not record:
            return json_error("Create your vault first.", 404)

        salt = base64.b64decode(record["salt"])
        expected = base64.b64decode(record["verifier"])
        actual = password_verifier(password, salt)

        if not hmac.compare_digest(actual, expected):
            return json_error("Incorrect master password.", 401)

        token = secrets.token_urlsafe(32)
        sessions[token] = {
            "key": derive_key(password, salt),
            "expires": time.time() + SESSION_SECONDS
        }
        return jsonify({"token": token})

    except Exception:
        app.logger.exception("Vault unlock failed")
        return json_error("Unable to unlock vault.", 500)


@app.post("/api/lock")
def lock():
    token = request.headers.get("X-Vault-Token", "")
    sessions.pop(token, None)
    return jsonify({"message": "Vault locked."})


def valid_text(value, maximum):
    return isinstance(value, str) and 0 < len(value.strip()) <= maximum


@app.get("/api/credentials")
@require_session
def list_credentials():
    session = get_session()
    result = []

    try:
        for item in credentials.find().sort("_id", -1):
            password = Fernet(session["key"]).decrypt(
                item["password_encrypted"].encode("ascii")
            ).decode("utf-8")

            result.append({
                "id": str(item["_id"]),
                "website": item["website"],
                "username": item["username"],
                "password": password,
                "category": item["category"]
            })

        return jsonify({"credentials": result})

    except InvalidToken:
        return json_error("Unable to decrypt credentials with this vault key.", 500)
    except Exception:
        app.logger.exception("Unable to read credentials")
        return json_error("Unable to load credentials.", 500)


@app.post("/api/credentials")
@require_session
def add_credential():
    data = request.get_json(silent=True) or {}

    website = data.get("website")
    username = data.get("username")
    password = data.get("password")
    category = data.get("category", "Other")

    if not valid_text(website, 120):
        return json_error("Website is required (maximum 120 characters).")
    if not valid_text(username, 254):
        return json_error("Username is required (maximum 254 characters).")
    if not isinstance(password, str) or not 1 <= len(password) <= 4096:
        return json_error("Password must contain between 1 and 4096 characters.")
    if category not in {"Social", "Work", "Finance", "Shopping", "Other"}:
        return json_error("Invalid category.")

    session = get_session()

    try:
        encrypted = Fernet(session["key"]).encrypt(
            password.encode("utf-8")
        ).decode("ascii")

        result = credentials.insert_one({
            "website": website.strip(),
            "username": username.strip(),
            "password_encrypted": encrypted,
            "category": category
        })

        return jsonify({
            "message": "Credential saved.",
            "id": str(result.inserted_id)
        }), 201

    except Exception:
        app.logger.exception("Unable to save credential")
        return json_error("Unable to save credential.", 500)


@app.delete("/api/credentials/<credential_id>")
@require_session
def delete_credential(credential_id):
    try:
        object_id = ObjectId(credential_id)
    except Exception:
        return json_error("Invalid credential ID.")

    try:
        result = credentials.delete_one({"_id": object_id})
        if result.deleted_count == 0:
            return json_error("Credential not found.", 404)

        return jsonify({"message": "Credential deleted."})

    except Exception:
        app.logger.exception("Unable to delete credential")
        return json_error("Unable to delete credential.", 500)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
