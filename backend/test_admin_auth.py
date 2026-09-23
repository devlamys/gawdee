import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.config import settings
from app.database import CREATE_TABLES_SQL
from app.main import app


class AdminSetupTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.enterContext(patch.object(settings, "GAWDEE_STORAGE", Path(directory)))
        with closing(sqlite3.connect(settings.db_path)) as db, db:
            db.executescript(CREATE_TABLES_SQL)
            db.execute(
                "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",
                ("Customer", "customer@example.com", "unused", "customer"),
            )
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.payload = {
            "name": "Test Owner",
            "email": "owner@example.com",
            "password": "TestOnly123!",
            "password_confirmation": "TestOnly123!",
        }

    def test_customer_email_conflict_keeps_setup_open(self):
        response = self.client.post(
            "/api/admin/setup", json={**self.payload, "email": "customer@example.com"}
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("different email", response.json()["detail"])
        self.assertTrue(self.client.get("/api/admin/setup-status").json()["setup_required"])
        with closing(sqlite3.connect(settings.db_path)) as db:
            self.assertEqual(db.execute("SELECT role FROM users").fetchall(), [("customer",)])

    def test_setup_establishes_session_and_allows_later_login(self):
        response = self.client.post("/api/admin/setup", json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/admin/me").status_code, 200)
        self.assertFalse(self.client.get("/api/admin/setup-status").json()["setup_required"])
        self.assertEqual(self.client.post("/api/admin/setup", json=self.payload).status_code, 403)
        self.client.post("/api/admin/logout")
        self.assertEqual(self.client.get("/api/admin/me").status_code, 401)
        response = self.client.post(
            "/api/admin/login",
            json={"email": self.payload["email"], "password": self.payload["password"]},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/admin/me").status_code, 200)


if __name__ == "__main__":
    unittest.main()
