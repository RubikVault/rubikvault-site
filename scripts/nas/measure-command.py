#!/usr/bin/env python3

import argparse
import json
import os
import signal
import subprocess
import time
from pathlib import Path


def read_meminfo():
    values = {}
    with open("/proc/meminfo", "r", encoding="utf-8") as handle:
        for line in handle:
            key, raw = line.split(":", 1)
            parts = raw.strip().split()
            if parts:
                try:
                    values[key] = int(parts[0])
                except ValueError:
                    continue
    return values


def read_cpu_stat():
    with open("/proc/stat", "r", encoding="utf-8") as handle:
        for line in handle:
            if line.startswith("cpu "):
                parts = [int(value) for value in line.split()[1:]]
                return {
                    "user": parts[0],
                    "nice": parts[1],
                    "system": parts[2],
                    "idle": parts[3],
                    "iowait": parts[4],
                    "irq": parts[5],
                    "softirq": parts[6],
                    "steal": parts[7] if len(parts) > 7 else 0,
                }
    return None


def read_process_group_stats(pgid):
    try:
        output = subprocess.check_output(
            ["ps", "-o", "rss=,%cpu=", "-g", str(pgid)],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except Exception:
        return {"rss_kb": 0, "pcpu": 0.0}
    rss_total = 0
    cpu_total = 0.0
    for raw in output.splitlines():
        line = raw.strip()
        if not line:
            continue
        parts = line.split(None, 1)
        if not parts:
            continue
        try:
            rss_total += int(parts[0])
        except ValueError:
            pass
        if len(parts) > 1:
            try:
                cpu_total += float(parts[1])
            except ValueError:
                pass
    return {"rss_kb": rss_total, "pcpu": cpu_total}


def cpu_window(before, after):
    if not before or not after:
        return {}
    before_total = sum(before.values())
    after_total = sum(after.values())
    total_delta = max(after_total - before_total, 1)
    idle_delta = max(after["idle"] - before["idle"], 0)
    iowait_delta = max(after["iowait"] - before["iowait"], 0)
    busy_delta = max(total_delta - idle_delta - iowait_delta, 0)
    return {
        "busy_pct": round((busy_delta / total_delta) * 100, 2),
        "idle_pct": round((idle_delta / total_delta) * 100, 2),
        "iowait_pct": round((iowait_delta / total_delta) * 100, 2),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cwd", required=True)
    parser.add_argument("--stdout", required=True)
    parser.add_argument("--stderr", required=True)
    parser.add_argument("--json", required=True)
    parser.add_argument("--timeout-sec", type=float, default=0)
    parser.add_argument("--set-env", action="append", default=[])
    parser.add_argument("--command", required=True)
    args = parser.parse_args()

    env = os.environ.copy()
    for item in args.set_env:
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        env[key] = value

    stdout_path = Path(args.stdout)
    stderr_path = Path(args.stderr)
    json_path = Path(args.json)
    stdout_path.parent.mkdir(parents=True, exist_ok=True)
    stderr_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.parent.mkdir(parents=True, exist_ok=True)

    mem_before = read_meminfo()
    cpu_before = read_cpu_stat()
    started_at = time.time()

    with open(stdout_path, "w", encoding="utf-8") as stdout_handle, open(stderr_path, "w", encoding="utf-8") as stderr_handle:
        proc = subprocess.Popen(
            args.command,
            cwd=args.cwd,
            env=env,
            shell=True,
            stdout=stdout_handle,
            stderr=stderr_handle,
            preexec_fn=os.setsid,
        )
        pgid = os.getpgid(proc.pid)
        peak_rss_kb = 0
        peak_pcpu = 0.0
        samples = []
        timed_out = False
        while proc.poll() is None:
            stats = read_process_group_stats(pgid)
            peak_rss_kb = max(peak_rss_kb, stats["rss_kb"])
            peak_pcpu = max(peak_pcpu, stats["pcpu"])
            samples.append(stats["rss_kb"])
            if args.timeout_sec and (time.time() - started_at) > args.timeout_sec:
                timed_out = True
                try:
                    os.killpg(pgid, signal.SIGTERM)
                except Exception:
                    pass
                time.sleep(1.0)
                if proc.poll() is None:
                    try:
                        os.killpg(pgid, signal.SIGKILL)
                    except Exception:
                        pass
                break
            time.sleep(0.25)
        if timed_out:
            proc.wait(timeout=5)
        final_stats = read_process_group_stats(pgid)
        peak_rss_kb = max(peak_rss_kb, final_stats["rss_kb"])
        peak_pcpu = max(peak_pcpu, final_stats["pcpu"])
        samples.append(final_stats["rss_kb"])
        returncode = proc.returncode
        if timed_out and returncode == 0:
            returncode = 124

    finished_at = time.time()
    mem_after = read_meminfo()
    cpu_after = read_cpu_stat()

    payload = {
        "schema_version": "nas.measure-command.v1",
        "command": args.command,
        "cwd": args.cwd,
        "started_at_epoch_sec": started_at,
        "finished_at_epoch_sec": finished_at,
        "duration_sec": round(finished_at - started_at, 3),
        "exit_code": returncode,
        "timed_out": timed_out,
        "peak_rss_kb": peak_rss_kb,
        "peak_rss_mb": round(peak_rss_kb / 1024, 2),
        "avg_rss_mb": round(((sum(samples) / max(len(samples), 1)) / 1024), 2),
        "peak_pcpu": round(peak_pcpu, 2),
        "mem_before": {
            "MemTotal_kb": mem_before.get("MemTotal"),
            "MemAvailable_kb": mem_before.get("MemAvailable"),
            "SwapTotal_kb": mem_before.get("SwapTotal"),
            "SwapFree_kb": mem_before.get("SwapFree"),
        },
        "mem_after": {
            "MemTotal_kb": mem_after.get("MemTotal"),
            "MemAvailable_kb": mem_after.get("MemAvailable"),
            "SwapTotal_kb": mem_after.get("SwapTotal"),
            "SwapFree_kb": mem_after.get("SwapFree"),
        },
        "cpu_window": cpu_window(cpu_before, cpu_after),
    }

    json_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    if returncode != 0:
        raise SystemExit(returncode)


if __name__ == "__main__":
    main()
