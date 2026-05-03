from fastapi import APIRouter

router = APIRouter()


@router.get("/healthz")
def healthz() -> dict[str, str]:
    # `service` is a deploy-script fingerprint: scripts/deploy-*.{sh,ps1} curl this
    # to assert the right image landed on the right Fly app. Don't rename.
    return {"status": "ok", "service": "robot-api"}
