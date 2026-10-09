#!/usr/bin/env bash
# vocabulary.sh — regenerate or check tests/unit/fixtures/vocabulary.json.
#
# The snapshot holds the codes of each vocabulary in src/js/vocabulary.js as
# declared by its authority at a pinned release. The unit tests compare the
# webui tables with the snapshot; this script compares the snapshot with the
# authority, so a code that moves upstream is caught when the pin is raised.
#
# Usage:  vocabulary.sh [--check]
#   (no flag)  rewrite the snapshot from the pinned sources
#   --check    exit 1 if the snapshot differs from the pinned sources
#   anything else prints this usage and exits 2 without writing
set -euo pipefail

usage() {
    echo "usage: $(basename "$0") [--check]" >&2
    exit 2
}

case "$#:${1:-}" in
    0:) check=false ;;
    1:--check) check=true ;;
    *) usage ;;
esac

SCHEMAS_TAG="v4.0.0"
SCHEMAS_URL="https://raw.githubusercontent.com/EdgeFirstAI/schemas/${SCHEMAS_TAG}/crates/schemas/src/sensor_msgs/mod.rs"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
snapshot="${root}/tests/unit/fixtures/vocabulary.json"

source_text="$(curl -fsSL "$SCHEMAS_URL")"

generated="$(SOURCE_URL="$SCHEMAS_URL" python3 -c '
import json, os, re, sys

text = sys.stdin.read()
block = re.search(r"pub mod point_field \{(.*?)\n\}", text, re.S)
if block is None:
    sys.exit("pub mod point_field not found in " + os.environ["SOURCE_URL"])
codes = {name: int(value) for name, value in
         re.findall(r"pub const (\w+): u8 = (\d+);", block.group(1))}
print(json.dumps({
    "point_field_datatype": {
        "authority": "edgefirst-schemas sensor_msgs::point_field",
        "source": os.environ["SOURCE_URL"],
        "codes": codes,
    },
}, indent=2))
' <<<"$source_text")"

if "$check"; then
    if ! diff -u "$snapshot" <(printf '%s\n' "$generated"); then
        echo "vocabulary.json differs from ${SCHEMAS_TAG}; run .github/scripts/vocabulary.sh" >&2
        exit 1
    fi
    echo "vocabulary.json matches ${SCHEMAS_TAG}"
else
    printf '%s\n' "$generated" > "$snapshot"
    echo "wrote ${snapshot}"
fi
