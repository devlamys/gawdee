"""Configure the signed Meta callback and n8n support relay without putting secrets in shell history."""

import asyncio
import getpass
import secrets
from urllib.parse import urlsplit

from app.database import get_db, get_setting, migrate, set_setting


async def main() -> None:
    db = await get_db()
    try:
        await migrate(db)
        current_url = await get_setting(db, "n8n_support_webhook_url")
        current_verify = await get_setting(db, "whatsapp_verify_token")
        current_app_secret = await get_setting(db, "whatsapp_app_secret")
        current_key = await get_setting(db, "n8n_support_webhook_key")

        default_url = current_url or "http://127.0.0.1:5678/webhook/gawdee/support"
        url = input(f"n8n support production URL [{default_url}]: ").strip() or default_url
        parsed = urlsplit(url)
        if not parsed.hostname or parsed.username or parsed.password or parsed.fragment or not (
            parsed.scheme == "https" or
            (parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1"))
        ):
            raise ValueError("Use an HTTPS URL or local HTTP URL for n8n.")

        verify_input = getpass.getpass("Meta webhook verify token (blank keeps existing or generates one): ").strip()
        app_secret_input = getpass.getpass("Meta App Secret (blank keeps existing): ").strip()
        key_input = getpass.getpass("n8n Header Auth value (blank keeps existing or generates one): ").strip()

        verify_token = verify_input or current_verify or secrets.token_urlsafe(32)
        app_secret = app_secret_input or current_app_secret
        key = key_input or current_key or secrets.token_urlsafe(32)
        if not app_secret:
            raise ValueError("The Meta App Secret is required before saving.")

        await set_setting(db, "n8n_support_webhook_url", url)
        await set_setting(db, "whatsapp_verify_token", verify_token, secret=True)
        await set_setting(db, "whatsapp_app_secret", app_secret, secret=True)
        await set_setting(db, "n8n_support_webhook_key", key, secret=True)

        print("WhatsApp support settings saved.")
        if not verify_input and not current_verify:
            print(f"Copy this verify token into Meta: {verify_token}")
        if not key_input and not current_key:
            print(f"Copy this value into the n8n support Webhook Header Auth credential: {key}")
        print("Header name: X-Gawdee-Automation-Key")
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
