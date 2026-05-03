import argparse
import hashlib
import hmac
import os
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument(
        "--base",
        default="https://robot-dashboard-andres-morones.fly.dev",
    )
    args = parser.parse_args()

    secret = os.environ.get("LINK_SIGNING_SECRET", "")
    if not secret:
        print("ERROR: set LINK_SIGNING_SECRET env var first.", file=sys.stderr)
        print("PowerShell: $env:LINK_SIGNING_SECRET = '<hex-secret>'", file=sys.stderr)
        sys.exit(1)

    # Token = "<unix_exp>.<hex_sig>". Expiry is the signed payload itself, so the
    # verifier can reject stale links without server-side state.
    # SHA-256 chosen for collision resistance; verifier MUST use hmac.compare_digest
    # to avoid timing-oracle leaks on the signature comparison.
    # Rotating LINK_SIGNING_SECRET invalidates every previously issued link — coordinate
    # rotation with a grace window or accept the cutover.
    exp = int(time.time()) + args.days * 86400
    sig = hmac.new(secret.encode(), str(exp).encode(), hashlib.sha256).hexdigest()
    token = f"{exp}.{sig}"

    base = args.base.rstrip("/")
    url = f"{base}/?t={token}"
    print(url)
    print(f"\n(valid for {args.days} days; expires at unix {exp} = "
          f"{time.strftime('%Y-%m-%d %H:%M %Z', time.localtime(exp))})", file=sys.stderr)


if __name__ == "__main__":
    main()
