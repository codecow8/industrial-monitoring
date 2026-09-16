import json
import os
import time
from datetime import UTC, datetime
from itertools import cycle
from urllib.request import Request, urlopen


TEMPERATURES = (68.4, 72.0, 78.5, 81.2, 83.0, 79.0, 74.0)
API_URL = os.getenv("TELEMETRY_API_URL", "http://127.0.0.1:8000/api/telemetry")
DATA_KEY = os.getenv("TELEMETRY_DATA_KEY", "pump1.outlet_temp")


def send_temperature(value: float) -> None:
    payload = json.dumps(
        {
            "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "values": {DATA_KEY: value},
        }
    ).encode()
    request = Request(
        API_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=5) as response:
        if response.status != 202:
            raise RuntimeError(f"Telemetry API returned HTTP {response.status}")


def main() -> None:
    print(f"Sending {DATA_KEY} to {API_URL} every second. Press Ctrl+C to stop.")
    try:
        for value in cycle(TEMPERATURES):
            send_temperature(value)
            print(f"{DATA_KEY} = {value:.1f}")
            time.sleep(1)
    except KeyboardInterrupt:
        print("Simulator stopped.")


if __name__ == "__main__":
    main()
