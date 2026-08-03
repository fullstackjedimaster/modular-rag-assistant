#!/usr/bin/env python3
"""Configure the Mesh DAQ RAG client telemetry allow-list through the Mod RAG API."""
from __future__ import annotations
import argparse
import httpx

FIELDS = {
    "status": "Derived panel status",
    "voltage": "Panel voltage in V",
    "current": "Panel current in A",
    "power": "Measured panel power in W",
    "temperature": "Panel temperature in °C",
    "irradiance": "Solar irradiance in W/m²",
    "expected_power": "Irradiance- and temperature-adjusted expected power in W",
    "performance_ratio": "Measured power divided by expected power",
    "environmental_state": "Environmental qualification for diagnosis",
    "diagnostic_basis": "Rule-based explanation for the current status",
}

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--client-id", required=True)
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    path = f"{base}/api/rag-clients/{args.client_id}/telemetry-messages"
    with httpx.Client(timeout=30) as client:
        current = client.get(path).json()
        by_name = {row["message_name"]: row for row in current}
        for name, description in FIELDS.items():
            body = {"message_name": name, "message_value": description}
            if name in by_name:
                row_id = by_name[name]["id"]
                response = client.put(f"{path}/{row_id}", json=body)
            else:
                response = client.post(path, json=body)
            response.raise_for_status()
            print(f"configured {name}")

if __name__ == "__main__":
    main()
