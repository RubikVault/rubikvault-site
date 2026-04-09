#!/usr/bin/env python3

import heapq
import os
import sys


def emit_best(paths):
    for size, path in sorted(paths, reverse=True):
        print(f"{size}\t{path}")


def push_best(best, limit, size, file_path):
    item = (size, file_path)
    if len(best) < limit:
        heapq.heappush(best, item)
    else:
        heapq.heappushpop(best, item)


def walk_same_fs(root, limit):
    skip_prefixes = {"/proc", "/sys", "/dev", "/run"}
    root_dev = os.stat(root).st_dev
    best = []
    for dirpath, dirnames, filenames in os.walk(root, topdown=True):
        if any(dirpath == prefix or dirpath.startswith(prefix + "/") for prefix in skip_prefixes):
            dirnames[:] = []
            continue
        try:
            if os.stat(dirpath).st_dev != root_dev:
                dirnames[:] = []
                continue
        except OSError:
            dirnames[:] = []
            continue
        keep = []
        for name in dirnames:
            full = os.path.join(dirpath, name)
            try:
                if os.stat(full).st_dev == root_dev and not any(full == prefix or full.startswith(prefix + "/") for prefix in skip_prefixes):
                    keep.append(name)
            except OSError:
                continue
        dirnames[:] = keep
        for name in filenames:
            full = os.path.join(dirpath, name)
            try:
                stat = os.stat(full)
            except OSError:
                continue
            if stat.st_dev != root_dev:
                continue
            push_best(best, limit, stat.st_size, full)
    emit_best(best)


def walk_roots(roots, limit):
    best = []
    for root in roots:
        if not os.path.exists(root):
            continue
        for dirpath, _, filenames in os.walk(root):
            for name in filenames:
                full = os.path.join(dirpath, name)
                try:
                    stat = os.stat(full)
                except OSError:
                    continue
                push_best(best, limit, stat.st_size, full)
    emit_best(best)


def walk_core_candidates(roots, limit):
    patterns = (".core", ".crash")
    names = {"core"}
    best = []
    for root in roots:
        if not os.path.exists(root):
            continue
        for dirpath, _, filenames in os.walk(root):
            for name in filenames:
                if name not in names and not name.endswith(patterns):
                    continue
                full = os.path.join(dirpath, name)
                try:
                    stat = os.stat(full)
                except OSError:
                    continue
                push_best(best, limit, stat.st_size, full)
    emit_best(best)


def main():
    if len(sys.argv) < 2:
        print("usage: system-partition-probe.py <largest-root-files|var-log-candidates|tmp-candidates|core-dump-candidates> [limit]", file=sys.stderr)
        return 2
    mode = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 200
    if mode == "largest-root-files":
        walk_same_fs("/", limit)
        return 0
    if mode == "var-log-candidates":
        walk_roots(["/var/log"], limit)
        return 0
    if mode == "tmp-candidates":
        walk_roots(["/tmp", "/var/tmp"], limit)
        return 0
    if mode == "core-dump-candidates":
        walk_core_candidates(["/var/crash", "/var/log", "/tmp", "/var/tmp"], limit)
        return 0
    print(f"unknown mode: {mode}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
