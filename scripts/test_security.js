const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const cache = {};
function loadTsModule(relativePath) {
  const tsPath = path.resolve(__dirname, relativePath);
  if (cache[tsPath]) return cache[tsPath];

  const tsCode = fs.readFileSync(tsPath, "utf8");
  const { outputText } = ts.transpileModule(tsCode, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const m = { exports: {} };
  const customRequire = (reqPath) => {
    if (reqPath.startsWith("./") || reqPath.startsWith("../")) {
      const dir = path.dirname(tsPath);
      const targetTs = path.resolve(dir, reqPath + ".ts");
      if (fs.existsSync(targetTs)) {
        return loadTsModule(path.relative(__dirname, targetTs));
      }
    }
    return require(reqPath);
  };
  const fn = new Function("module", "exports", "require", "__dirname", "__filename", outputText);
  fn(m, m.exports, customRequire, path.dirname(tsPath), tsPath);
  cache[tsPath] = m.exports;
  return m.exports;
}

const { chatRateLimiter, authRateLimiter } = loadTsModule("../src/lib/rateLimit.ts");
const { verifyTurnstile } = loadTsModule("../src/lib/turnstile.ts");

async function runTests() {
  console.log("=== RUNNING RATE LIMITING & TURNSTILE TESTS (CHATBOT-SERVICE) ===");

  // 1. In-Memory Sliding Window Rate Limiting Tests
  console.log("\n[Test 1] Chat Rate Limiter allows requests within threshold");
  chatRateLimiter.reset();
  const ip = "192.168.1.10";

  for (let i = 1; i <= 5; i++) {
    const res = chatRateLimiter.check(ip, { windowMs: 1000, maxRequests: 5 });
    assert.strictEqual(res.allowed, true, `Request ${i} should be allowed`);
    assert.strictEqual(res.remaining, 5 - i, `Remaining should be ${5 - i}`);
  }
  console.log("  Passed! Allowed 5 requests within limit.");

  console.log("\n[Test 2] Chat Rate Limiter blocks request exceeding threshold");
  const blockedRes = chatRateLimiter.check(ip, { windowMs: 1000, maxRequests: 5 });
  assert.strictEqual(blockedRes.allowed, false, "Request 6 should be blocked");
  assert.strictEqual(blockedRes.remaining, 0, "Remaining should be 0");
  assert.ok(blockedRes.resetSeconds >= 1, "Reset seconds should be >= 1");
  console.log("  Passed! Blocked excess request and returned resetSeconds.");

  console.log("\n[Test 3] Different IP has independent rate limit bucket");
  const ip2 = "192.168.1.20";
  const resIp2 = chatRateLimiter.check(ip2, { windowMs: 1000, maxRequests: 5 });
  assert.strictEqual(resIp2.allowed, true, "Different IP should have independent quota");
  assert.strictEqual(resIp2.remaining, 4, "Remaining should be 4 for new IP");
  console.log("  Passed! Multiple clients have isolated buckets.");

  console.log("\n[Test 4] Turnstile verification skips gracefully when secret is unconfigured");
  delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  const skipResult = await verifyTurnstile(null);
  assert.strictEqual(skipResult.success, true, "Should succeed when unconfigured");
  assert.strictEqual(skipResult.skipped, true, "Should set skipped flag");
  console.log("  Passed! Gracefully skipped when unconfigured.");

  console.log("\n[Test 5] Turnstile verification requires token when secret is configured");
  process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "dummy_secret_for_test";
  const noTokenResult = await verifyTurnstile("");
  assert.strictEqual(noTokenResult.success, false, "Should fail when token is empty");
  assert.ok(noTokenResult.error && noTokenResult.error.includes("required"), "Error should mention token required");
  console.log("  Passed! Required token when secret is present.");

  console.log("\n[Test 6] Turnstile verification handles Cloudflare test keys (1x0000000000000000000000000000000AA)");
  // Cloudflare official test secret key for always passing:
  process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
  const testToken = "XXXX.DUMMY.TOKEN.XXXX";
  const liveResult = await verifyTurnstile(testToken);
  assert.strictEqual(liveResult.success, true, "Always-pass test secret should return success");
  console.log("  Passed! Verified Cloudflare official always-pass challenge response.");

  console.log("\n🎉 ALL RATE LIMIT & TURNSTILE TESTS PASSED SUCCESSFULLY!\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
