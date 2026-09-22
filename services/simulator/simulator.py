import json
import os
import time
from datetime import UTC, datetime
from itertools import cycle
from urllib.request import Request, urlopen


TEMPERATURES = (68.4, 72.0, 78.5, 81.2, 83.0, 79.0, 74.0)
DEVICE_STATES = (1, 3, 1, 2, 0, 1)
API_URL = os.getenv("TELEMETRY_API_URL", "http://127.0.0.1:8000/api/telemetry")
DATA_KEY = os.getenv("TELEMETRY_DATA_KEY", "pump1.outlet_temp")
STATE_DATA_KEY = os.getenv("TELEMETRY_STATE_DATA_KEY", "pump1.operating_state")


def send_telemetry(value: float, device_state: int) -> None:
    payload = json.dumps(
        {
            "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "values": {DATA_KEY: value, STATE_DATA_KEY: device_state},
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
    print(
        f"Sending {DATA_KEY} and {STATE_DATA_KEY} to {API_URL} every second. "
        "Press Ctrl+C to stop."
    )
    try:
        for value, device_state in zip(cycle(TEMPERATURES), cycle(DEVICE_STATES)):
            send_telemetry(value, device_state)
            print(f"{DATA_KEY} = {value:.1f}; {STATE_DATA_KEY} = {device_state}")
            time.sleep(1)
    except KeyboardInterrupt:
        print("Simulator stopped.")


if __name__ == "__main__":
    main()
