"""
Seed the ECSI Attendance database with dummy data for local testing.

Usage (from the `backend/` directory):

    python seed.py            # create tables if needed, then upsert dummy data
    python seed.py --reset    # wipe all rows first, then reseed (destructive)

Credentials created (also match the frontend's demo-mode accounts):

    ADMIN001     / Admin@1234      super_admin
    FAC001       / Faculty@1234    faculty   (adviser: Grade 10-A, Grade 11-C)
    FAC002       / Faculty@1234    faculty   (adviser: Grade 9-B)
    STU2024001   / Student@1234    student   (Grade 10-A)
    ...          / Student@1234    remaining students & faculty share the same passwords
"""

import argparse
import asyncio
import base64
import math
import random
import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy import delete, func, select

from config import settings
from database import AsyncSessionLocal, engine, init_db
from models.attendance import (
    AttendanceRecord,
    AttendanceStatus,
    CheckType,
    ProxyAuditLog,
)
from models.user import AccountStatus, FaceEmbedding, RFIDCard, User, UserRole
from services import storage
from utils.security import hash_password

# ── Config ────────────────────────────────────────────────────────────────────
RNG = random.Random(20260621)
HISTORY_DAYS = 14
TERMINALS = ["TERMINAL-01", "TERMINAL-02"]
UUID_NS = uuid.UUID("6f9619ff-8b86-d011-b42d-00c04fc964ff")

SECTIONS = [
    ("Grade 9-A", "Junior High"),
    ("Grade 9-B", "Junior High"),
    ("Grade 10-A", "Junior High"),
    ("Grade 10-B", "Junior High"),
    ("Grade 11-A", "Senior High"),
    ("Grade 11-B", "Senior High"),
    ("Grade 11-C", "Senior High"),
    ("Grade 12-A", "Senior High"),
    ("Grade 12-B", "Senior High"),
]

STUDENT_NAMES = [
    "Juan dela Cruz", "Ana Reyes", "Carlos Bautista", "Lea Garcia",
    "Miguel Torres", "Sofia Ramos", "Daniel Cruz", "Camille Mendoza",
    "Nathaniel Uy", "Angelica Villamor", "Francis Aquino", "Bianca Navarro",
    "Ethan Salazar", "Grace Tan", "Marco Lim", "Andrea Domingo",
]

FACULTY_NAMES = [
    ("Maria Santos", "Science"),
    ("Jose Reyes", "Math"),
    ("Lorna Dela Rosa", "English"),
]

# id_number, full_name, role, status, section, department, email, has_rfid, has_face
PEOPLE = [
    ("ADMIN001", "Admin User", UserRole.SUPER_ADMIN, AccountStatus.ACTIVE,
     None, "IT", "admin@ecsi.edu.ph", True, True),
    ("ADMIN002", "Registrar User", UserRole.SUPER_ADMIN, AccountStatus.ACTIVE,
     None, "Registrar", "registrar@ecsi.edu.ph", True, True),

    ("FAC001", "Maria Santos", UserRole.FACULTY, AccountStatus.ACTIVE,
     "Grade 10-A", "Science", "fac001@ecsi.edu.ph", True, True),
    ("FAC002", "Jose Reyes", UserRole.FACULTY, AccountStatus.ACTIVE,
     "Grade 9-B", "Math", "fac002@ecsi.edu.ph", True, True),
    ("FAC003", "Lorna Dela Rosa", UserRole.FACULTY, AccountStatus.ACTIVE,
     "Grade 11-C", "English", "fac003@ecsi.edu.ph", True, False),

    ("STU2024001", "Juan dela Cruz", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 10-A", None, "stu2024001@ecsi.edu.ph", True, True),
    ("STU2024002", "Ana Reyes", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 10-A", None, "stu2024002@ecsi.edu.ph", True, False),
    ("STU2024003", "Carlos Bautista", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 9-B", None, "stu2024003@ecsi.edu.ph", False, False),
    ("STU2024004", "Lea Garcia", UserRole.STUDENT, AccountStatus.INACTIVE,
     "Grade 11-C", None, "stu2024004@ecsi.edu.ph", True, True),
    ("STU2024005", "Miguel Torres", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 9-A", None, "stu2024005@ecsi.edu.ph", True, True),
    ("STU2024006", "Sofia Ramos", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 9-A", None, "stu2024006@ecsi.edu.ph", True, True),
    ("STU2024007", "Daniel Cruz", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 10-A", None, "stu2024007@ecsi.edu.ph", True, True),
    ("STU2024008", "Camille Mendoza", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 10-B", None, "stu2024008@ecsi.edu.ph", True, True),
    ("STU2024009", "Nathaniel Uy", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 10-B", None, "stu2024009@ecsi.edu.ph", True, True),
    ("STU2024010", "Angelica Villamor", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 11-A", None, "stu2024010@ecsi.edu.ph", True, True),
    ("STU2024011", "Francis Aquino", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 11-A", None, "stu2024011@ecsi.edu.ph", True, False),
    ("STU2024012", "Bianca Navarro", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 11-C", None, "stu2024012@ecsi.edu.ph", True, True),
    ("STU2024013", "Ethan Salazar", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 12-A", None, "stu2024013@ecsi.edu.ph", True, True),
    ("STU2024014", "Grace Tan", UserRole.STUDENT, AccountStatus.SUSPENDED,
     "Grade 12-A", None, "stu2024014@ecsi.edu.ph", True, True),
    ("STU2024015", "Marco Lim", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 12-B", None, "stu2024015@ecsi.edu.ph", True, True),
    ("STU2024016", "Andrea Domingo", UserRole.STUDENT, AccountStatus.ACTIVE,
     "Grade 12-B", None, "stu2024016@ecsi.edu.ph", True, True),
]


# ── Placeholder capture images ────────────────────────────────────────────────
# Seeded proxy logs reference intruder images so the audit trail looks realistic.
# These bytes are a valid 1x1 JPEG pushed through the same storage layer the app
# uses, so signed URLs resolve instead of 404ing. They contain no real biometric
# data — only a stand-in for the real capture.
_PLACEHOLDER_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7"
    "Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7"
    "Ozs7Ozs7Ozv/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUF"
    "BAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVW"
    "V1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi"
    "4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAEC"
    "AxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVm"
    "Z2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq"
    "8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDxmiirWmaZeazqEWn6fD51zNnYm4LnAJPJIHQGgCrRXVf8Ky8Y/wDQH/8AJmH/AOKo/wCF"
    "ZeMf+gP/AOTMP/xVAHK0V1X/AArLxj/0B/8AyZh/+Ko/4Vl4x/6A/wD5Mw//ABVAHK0Va1PTLzRtQl0/UIfJuYcb03BsZAI5BI6E"
    "VVoAK6r4Zf8AJQdM/wC2v/op65Wtnwp/yHD/ANed3/6TyUAe/f8ACRaH/wBBmw/8Ck/xq5b3EF3As9tNHNE2dskbBlODjgj3rzXw"
    "paeCr+ws7TUVVtUlZlZWeVQTuO0ZBC5xj/8AXV/xPYxLc6b4L0WH7LFdP585XJyuTySW+bAViQf7q46UAdra6rp19KYrPULW4kC7"
    "ikUyuQPXAPTkVNcXEFpA09zNHDEuN0kjBVGTjkn3rjNZ+Hdqmnxy6AZIL+2wysZTmYj3z8rZGQRgZ9OozPEsZ/4S+y/4SyVv7Pa3"
    "VkNuWESOFG8D5SSCwOcc4ZeRjFAHEfEaeG68dahPbzJNE/lbZI2DK2I1BwR15BH4VzJBGMjr0ro/GMmnxa7dQaVEjaeVja3YMxHK"
    "KTyec5J47dD6VkXv/Hta/wC5/QUAU62fCn/IcP8A153f/pPJWNXVfDL/AJKDpn/bX/0U9AHdeENe8KaXotob1reLUo9++T7KzSDL"
    "Nj5wp/hI79OKk8T30TXOm+NNFm+1RWr+ROFyMLk8EFflyGYEn+8uOtdf/wAI7of/AEBrD/wFT/CrlvbwWkCwW0McMS52xxqFUZOe"
    "APegDjtV+I9p9kgXQomu764YARSRNiPOOCB95jnACn8embereLtOtNW/sXXdP2QNCrySuvmxFuuAu3LLkY3Y6joMZroLXStOsZTL"
    "Z6fa28hXaXihVCR6ZA6cCpLqytb6IRXltDcRhtwSWMOAfXB78mgDwjxY2nT6zqMmmiMaexVrfapUA7BuwD0G7OB/TFYN7/x7Wv8A"
    "uf0FbXxGhitfHOoW9vEkMMfl7I41CquYkJwBwOa5kknGT06UAFWtM1O80bUItQ0+bybmHOx9obGQQeCCOhNVaKAOq/4Wb4x/6DH/"
    "AJLQ/wDxNH/CzfGP/QY/8lof/ia5WigDqv8AhZvjH/oMf+S0P/xNH/CzfGP/AEGP/JaH/wCJrlaKALWp6neazqEuoahN51zNje+0"
    "LnAAHAAHQCqtFFAH/9k="
)


async def _seed_placeholder_captures(keys) -> None:
    """Upload a tiny placeholder JPEG for every referenced capture key."""
    try:
        await storage.get_storage().ensure_buckets()
    except Exception as exc:               # never fail the seed because of storage
        print(f"  capture images:   skipped ({exc})")
        return

    ok = failed = 0
    for key in keys:
        try:
            await storage.save_capture("", key, _PLACEHOLDER_JPEG, "image/jpeg")
            ok += 1
        except Exception:
            failed += 1
    print(f"  capture images:   {ok} uploaded"
          + (f", {failed} failed" if failed else ""))


def deterministic_uuid(seed: str) -> str:
    return str(uuid.uuid5(UUID_NS, f"ecsi:{seed}"))


def password_for(role: UserRole, id_number: str) -> str:
    if id_number == "ADMIN001":
        return "Admin@1234"
    if id_number == "ADMIN002":
        return "Registrar@1234"
    if role is UserRole.FACULTY:
        return "Faculty@1234"
    return "Student@1234"


def fake_embedding(user_id: str, dims: int = 512) -> list:
    """Deterministic pseudo-random unit-ish vector standing in for an ArcFace embedding."""
    rng = random.Random(user_id)
    vec = [rng.gauss(0.0, 1.0) for _ in range(dims)]
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [round(v / norm, 6) for v in vec]


def card_uid_for(index: int) -> str:
    return f"ECSI{index:04d}A1B2"


def tap_time(day: date, rng: random.Random) -> datetime:
    """Realistic school-arrival window: 06:45–08:30, with a few late taps."""
    base = datetime.combine(day, time(6, 45))
    offset = int(rng.triangular(0, 105, 40))
    return base + timedelta(minutes=offset, seconds=rng.randint(0, 59))


async def wipe(session) -> None:
    for model in (ProxyAuditLog, AttendanceRecord, FaceEmbedding, RFIDCard, User):
        await session.execute(delete(model))
    await session.commit()
    print("  wiped users / rfid_cards / face_embeddings / attendance_records / proxy_audit_logs")


async def seed(session, reset: bool) -> None:
    if reset:
        await wipe(session)

    existing = (await session.execute(select(func.count(User.id)))).scalar_one()
    if existing:
        print(f"  {existing} user(s) already present — records will be updated in place.")
        print("  Re-run with --reset if you want a clean slate.")

    # ── Users ────────────────────────────────────────────────────────────────
    users: dict[str, User] = {}
    hashed_cache: dict[str, str] = {}

    for idx, (id_num, name, role, status, section, dept, email, _, _) in enumerate(PEOPLE):
        pw = password_for(role, id_num)
        if pw not in hashed_cache:
            hashed_cache[pw] = hash_password(pw)

        user = await session.get(User, deterministic_uuid(id_num))
        if user is None:
            user = User(id=deterministic_uuid(id_num))
            session.add(user)

        user.id_number = id_num
        user.full_name = name
        user.email = email
        user.hashed_password = hashed_cache[pw]
        user.role = role
        user.status = status
        user.section = section
        user.department = dept
        users[id_num] = user

    await session.flush()
    print(f"  users:            {len(users)}")

    # ── RFID cards ───────────────────────────────────────────────────────────
    cards = 0
    for idx, (id_num, _, _, _, _, _, _, has_rfid, _) in enumerate(PEOPLE):
        if not has_rfid:
            continue
        uid = card_uid_for(idx + 1)
        card = await session.get(RFIDCard, deterministic_uuid(f"rfid:{id_num}"))
        if card is None:
            card = RFIDCard(id=deterministic_uuid(f"rfid:{id_num}"))
            session.add(card)
        card.user_id = users[id_num].id
        card.card_uid = uid
        card.is_active = True
        cards += 1
    await session.flush()
    print(f"  rfid_cards:       {cards}")

    # ── Face embeddings ──────────────────────────────────────────────────────
    embeddings = 0
    for id_num, _, _, _, _, _, _, _, has_face in PEOPLE:
        if not has_face:
            continue
        emb = await session.get(FaceEmbedding, deterministic_uuid(f"face:{id_num}"))
        if emb is None:
            emb = FaceEmbedding(id=deterministic_uuid(f"face:{id_num}"))
            session.add(emb)
        emb.user_id = users[id_num].id
        emb.embedding_vector = fake_embedding(id_num, settings.EMBEDDING_DIMENSIONS)
        emb.model_name = settings.FACE_MODEL
        emb.source_frame_count = settings.CAPTURE_FRAMES_COUNT
        embeddings += 1
    await session.flush()
    print(f"  face_embeddings:  {embeddings} ({settings.EMBEDDING_DIMENSIONS}-dim {settings.FACE_MODEL})")

    # ── Attendance history + proxy audit logs ────────────────────────────────
    uid_by_user = {}
    for id_num, _, _, _, _, _, _, has_rfid, _ in PEOPLE:
        if has_rfid:
            uid_by_user[id_num] = card_uid_for([p[0] for p in PEOPLE].index(id_num) + 1)

    admins = [p for p in PEOPLE if p[2] is UserRole.SUPER_ADMIN]
    tap_pool = [p[0] for p in PEOPLE if p[0] in uid_by_user]
    threshold = settings.COSINE_DISTANCE_THRESHOLD

    records = 0
    proxies = 0
    today = date.today()

    for days_ago in range(HISTORY_DAYS, -1, -1):
        day = today - timedelta(days=days_ago)
        is_weekend = day.weekday() >= 5
        # Today is partially complete so the dashboard shows a believable mid-day state.
        tap_count = RNG.randint(0, 3) if is_weekend else RNG.randint(8, 14)

        for _ in range(tap_count):
            id_num = RNG.choice(tap_pool)
            user = users[id_num]
            roll = RNG.random()

            if roll < 0.80:
                status = AttendanceStatus.VERIFIED
                distance = round(RNG.uniform(0.05, threshold - 0.02), 4)
            elif roll < 0.90:
                status = AttendanceStatus.PROXY_ANOMALY
                distance = round(RNG.uniform(threshold + 0.05, 0.85), 4)
            elif roll < 0.95:
                status = AttendanceStatus.MANUAL_OVERRIDE
                distance = None
            else:
                status = AttendanceStatus.PENDING_REVIEW
                distance = None

            # Today's taps keep the same 06:45-08:30 window so they land inside
            # today()'s date range and are counted by the analytics/summary
            # queries. They may read as "slightly ahead of the clock" if you seed
            # before 06:45 -- harmless for dev data.
            ts = tap_time(day, RNG)

            rec_id = deterministic_uuid(f"att:{id_num}:{days_ago}:{records}")
            rec = await session.get(AttendanceRecord, rec_id)
            if rec is None:
                rec = AttendanceRecord(id=rec_id)
                session.add(rec)

            rec.user_id = user.id
            rec.card_uid_used = uid_by_user[id_num]
            rec.status = status
            rec.check_type = CheckType.TIME_IN
            rec.cosine_distance = distance
            rec.terminal_id = RNG.choice(TERMINALS)
            rec.timestamp = ts
            # Real hardware writes a camera frame for every scan, so the demo
            # data does too: a stored object KEY, not a filesystem path (audit
            # captures live in a private bucket and need a signed URL).
            rec.captured_frame_path = f"verified/{day.isoformat()}_{id_num}_{records}.jpg"

            if status is AttendanceStatus.MANUAL_OVERRIDE:
                officer = users[RNG.choice(admins)[0]]
                rec.override_by = officer.id
                rec.override_note = RNG.choice([
                    "Confirmed identity with adviser.",
                    "Student presented a valid excuse slip.",
                    "Card reader glitch — verified manually.",
                ])
            else:
                rec.override_by = None
                rec.override_note = None

            if status is AttendanceStatus.PROXY_ANOMALY:
                log_id = deterministic_uuid(f"proxy:{id_num}:{days_ago}:{records}")
                log = await session.get(ProxyAuditLog, log_id)
                if log is None:
                    log = ProxyAuditLog(id=log_id)
                    session.add(log)
                log.attendance_record_id = rec_id
                log.intruder_image_path = f"intruders/{day.isoformat()}_{id_num}_{records}.jpg"
                log.cosine_distance = distance
                log.card_uid = uid_by_user[id_num]
                log.registered_user_id = user.id
                log.terminal_id = rec.terminal_id
                log.detected_at = ts
                log.resolution_note = RNG.choice([
                    None,
                    "Referred to the prefect of discipline.",
                    "Confirmed to be a sibling using the card.",
                ])
                proxies += 1

            records += 1

    await session.flush()
    await session.commit()

    print(f"  attendance:       {records} records over the last {HISTORY_DAYS + 1} days")
    print(f"  proxy_audit_logs: {proxies}")

    # Make the referenced capture images retrievable via signed URL: camera
    # frames (AttendanceRecord) and intruder crops (ProxyAuditLog) alike.
    result = await session.execute(select(AttendanceRecord.captured_frame_path))
    capture_keys = [k for (k,) in result.all() if k]
    result = await session.execute(select(ProxyAuditLog.intruder_image_path))
    capture_keys += [k for (k,) in result.all() if k]
    if capture_keys:
        await _seed_placeholder_captures(capture_keys)
    print()
    print("  Login credentials")
    print("  ------------------")
    for id_num, name, role, status, *_ in PEOPLE:
        if id_num in ("ADMIN001", "ADMIN002", "FAC001", "STU2024001",
                      "STU2024004", "STU2024014"):
            flag = "" if status is AccountStatus.ACTIVE else f"  [{status.value} - login blocked]"
            print(f"    {id_num:<12} {password_for(role, id_num):<14} {role.value:<12} {name}{flag}")
    print()
    print(f"  All other accounts share the role password: "
          f"Admin@1234 / Faculty@1234 / Student@1234")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed dummy ECSI attendance data.")
    parser.add_argument("--reset", action="store_true", help="delete all existing rows first")
    args = parser.parse_args()

    print(f"Database: {settings.DATABASE_URL}")
    print(f"Storage:  {settings.storage_backend}")
    await init_db()
    print("Tables ready.")
    print("Seeding dummy data...")
    async with AsyncSessionLocal() as session:
        await seed(session, args.reset)
    # Release the storage HTTP pool too, so a --reset run against Supabase
    # exits cleanly instead of tripping the "unclosed client" warning.
    await storage.aclose()
    await engine.dispose()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
