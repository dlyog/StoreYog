"""SMTP transport adapted from InvestYog/backend/core/mailer.py.
The SMTP EHLO, STARTTLS, login and sendmail sequence is unchanged.
Credentials come only from the parent process environment; payload arrives on stdin.
"""
from __future__ import annotations
import os, sys, json, logging, smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
logger = logging.getLogger(__name__)
def is_configured() -> bool:
    return bool(os.environ.get("SMTP_HOST")) and bool(os.environ.get("SMTP_FROM_ADDRESS"))

def send_email(to_address: str, subject: str, text_body: str, html_body: str | None = None, recipients: list[str] | None = None) -> bool:
    if not is_configured():
        return False

    smtp_host = os.environ["SMTP_HOST"]
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    from_address = os.environ["SMTP_FROM_ADDRESS"]
    from_name = os.environ.get("SMTP_FROM_NAME", "StoreYog")
    use_tls = os.environ.get("SMTP_USE_TLS", "true").lower() != "false"
    username = os.environ.get("SMTP_USERNAME")
    password = os.environ.get("SMTP_PASSWORD")

    body = MIMEMultipart("alternative")
    body.attach(MIMEText(text_body, "plain", "utf-8"))
    if html_body:
        body.attach(MIMEText(html_body, "html", "utf-8"))

    msg = body

    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_address}>"
    msg["To"] = ", ".join(recipients or [to_address])

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            if use_tls:
                server.starttls()
                server.ehlo()
            if username and password:
                server.login(username, password)
            server.sendmail(from_address, recipients or [to_address], msg.as_string())
    except Exception:
        logger.warning("Failed to send email to %s via %s:%s", to_address, smtp_host, smtp_port, exc_info=True)
        return False
    return True
if __name__ == "__main__":
    payload = json.load(sys.stdin)
    ok = send_email(payload["to"], payload["subject"], payload["text"], payload.get("html"), payload.get("recipients"))
    print(json.dumps({"accepted": ok}))
    sys.exit(0 if ok else 1)
