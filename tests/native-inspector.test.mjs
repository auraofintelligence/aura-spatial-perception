import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);

test("native inspector exposes a read-only, source-first command", async () => {
  const { stdout } = await run("python", ["tools/inspect_gopro_360.py", "--help"], { cwd: new URL("../", import.meta.url) });
  assert.match(stdout, /original GoPro MAX \.360 file/i);
  assert.match(stdout, /--packet-timing/);
  assert.match(stdout, /--extract-data-dir/);
});
