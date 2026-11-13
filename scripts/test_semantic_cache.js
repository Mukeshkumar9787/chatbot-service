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
    if (reqPath.startsWith("./") || reqPath.startsWith("../") || reqPath.startsWith("@/")) {
      let resolved = reqPath;
      if (reqPath.startsWith("@/")) {
        resolved = path.resolve(__dirname, "../src", reqPath.slice(2));
      } else {
        resolved = path.resolve(path.dirname(tsPath), reqPath);
      }
      const candidateTs = resolved.endsWith(".ts") ? resolved : resolved + ".ts";
      if (fs.existsSync(candidateTs)) {
        return loadTsModule(path.relative(__dirname, candidateTs));
      }
    }
    return require(reqPath);
  };
  const fn = new Function("module", "exports", "require", "__dirname", "__filename", outputText);
  fn(m, m.exports, customRequire, path.dirname(tsPath), tsPath);
  cache[tsPath] = m.exports;
  return m.exports;
}

const {
  computeCosineSimilarity,
  findSemanticCacheMatch,
  storeInSemanticCache,
  invalidateSemanticCache,
  getSemanticCacheStats,
  resetInMemoryCache,
} = loadTsModule("../src/lib/semanticCache.ts");

function createMockVector(dim = 768, seed = 1) {
  const vec = new Array(dim);
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    const val = Math.sin(seed * (i + 1));
    vec[i] = val;
    norm += val * val;
  }
  const sqrtNorm = Math.sqrt(norm);
  return vec.map((v) => v / sqrtNorm);
}

function perturbVector(vec, alpha = 0.08) {
  // Generate unit noise vector
  const rawNoise = vec.map((_, i) => Math.sin(i * 3));
  const noiseNorm = Math.sqrt(rawNoise.reduce((acc, v) => acc + v * v, 0));
  const unitNoise = rawNoise.map((v) => v / noiseNorm);

  // Blend: (1 - alpha) * unitVec + alpha * unitNoise
  const blended = vec.map((v, i) => (1 - alpha) * v + alpha * unitNoise[i]);
  const norm = Math.sqrt(blended.reduce((acc, v) => acc + v * v, 0));
  return blended.map((v) => v / norm);
}

async function runTests() {
  console.log("=== RUNNING SEMANTIC CACHING TESTS (CHATBOT-SERVICE) ===");

  // Reset before testing
  resetInMemoryCache();

  // Test 1: Cosine Similarity Math
  console.log("\n[Test 1] Cosine Similarity calculation correctness");
  const v1 = createMockVector(768, 42);
  const v1Same = [...v1];
  const simIdentical = computeCosineSimilarity(v1, v1Same);
  assert.ok(Math.abs(simIdentical - 1.0) < 0.001, "Identical vectors should have similarity ~1.0");

  const vOpposite = v1.map((x) => -x);
  const simOpposite = computeCosineSimilarity(v1, vOpposite);
  assert.ok(Math.abs(simOpposite - -1.0) < 0.001, "Opposite vectors should have similarity ~-1.0");
  console.log("  Passed! Cosine similarity functions accurately.");

  // Test 2: Cache Miss on Empty Cache
  console.log("\n[Test 2] Empty cache returns null (MISS)");
  const emptyMiss = await findSemanticCacheMatch(v1, 0.90);
  assert.strictEqual(emptyMiss, null, "Query on empty cache should return null");
  console.log("  Passed! Uncached query returns null.");

  // Test 3: Exact Vector Match (Cache HIT)
  console.log("\n[Test 3] Exact vector match returns cached answer and sources (HIT)");
  const testQuery = "What is the return window for clothing?";
  const testAnswer = "You can return clothing within 14 days of delivery in original condition.";
  const testSources = [{ document: "return_policy.md", snippet: "14 days return window" }];

  await storeInSemanticCache(v1, testQuery, testAnswer, testSources, 3600);
  const exactHit = await findSemanticCacheMatch(v1, 0.90);

  assert.ok(exactHit !== null, "Exact vector should match");
  assert.strictEqual(exactHit.hit, true, "Hit flag should be true");
  assert.strictEqual(exactHit.answer, testAnswer, "Answer should match stored answer");
  assert.strictEqual(exactHit.sources.length, 1, "Sources should be preserved");
  assert.strictEqual(exactHit.sources[0].document, "return_policy.md");
  assert.ok(exactHit.score >= 0.99, `Exact match score should be ~1.0, got ${exactHit.score}`);
  console.log(`  Passed! Exact match hit with score: ${exactHit.score}`);

  // Test 4: Semantically Similar / Paraphrased Vector (Cache HIT)
  console.log("\n[Test 4] Paraphrased question with >= 0.90 cosine similarity hits cache");
  // Perturb slightly (representing a paraphrased wording like "How many days do I have to return clothes?")
  const vParaphrased = perturbVector(v1, 0.08);
  const similarity = computeCosineSimilarity(v1, vParaphrased);
  console.log(`  Paraphrase cosine similarity: ${similarity.toFixed(4)}`);
  assert.ok(similarity >= 0.90, "Simulated paraphrase should be >= 0.90");

  const paraphraseHit = await findSemanticCacheMatch(vParaphrased, 0.90);
  assert.ok(paraphraseHit !== null, "Paraphrased query should hit cache");
  assert.strictEqual(paraphraseHit.answer, testAnswer, "Paraphrased hit should return cached answer");
  assert.ok(paraphraseHit.hit_count >= 2, "Hit count should increment");
  console.log(`  Passed! Semantic match hit (hit_count: ${paraphraseHit.hit_count}, score: ${paraphraseHit.score})`);

  // Test 5: Distinct / Unrelated Vector (Cache MISS)
  console.log("\n[Test 5] Unrelated question vector with low similarity misses cache");
  const vUnrelated = createMockVector(768, 9999);
  const unrelatedSim = computeCosineSimilarity(v1, vUnrelated);
  console.log(`  Unrelated vector similarity: ${unrelatedSim.toFixed(4)}`);
  assert.ok(unrelatedSim < 0.90, "Unrelated query similarity should be below 0.90");

  const unrelatedMiss = await findSemanticCacheMatch(vUnrelated, 0.90);
  assert.strictEqual(unrelatedMiss, null, "Unrelated query should miss cache");
  console.log("  Passed! Unrelated query returned null (MISS).");

  // Test 6: Skip caching refusal / error answers
  console.log("\n[Test 6] Refusal and fallback error messages are skipped from caching");
  const vRefusal = createMockVector(768, 123);
  const skippedId = await storeInSemanticCache(
    vRefusal,
    "harmful prompt",
    "I cannot process this request due to safety guidelines."
  );
  assert.strictEqual(skippedId, "", "Refusal response should not be cached");

  const refusalCheck = await findSemanticCacheMatch(vRefusal, 0.90);
  assert.strictEqual(refusalCheck, null, "Refusal vector should not exist in cache");
  console.log("  Passed! Safety refusal not cached.");

  // Test 7: Cache Invalidation
  console.log("\n[Test 7] Invalidation clears cached items completely");
  await invalidateSemanticCache();
  const postInvalidateCheck = await findSemanticCacheMatch(v1, 0.90);
  assert.strictEqual(postInvalidateCheck, null, "Post-invalidation query should miss cache");
  console.log("  Passed! Cache invalidated and clean.");

  // Test 8: Cache Stats
  console.log("\n[Test 8] Semantic Cache statistics inspection");
  const stats = await getSemanticCacheStats();
  assert.strictEqual(stats.enabled, true, "Cache should be enabled");
  assert.strictEqual(stats.similarity_threshold, 0.90);
  assert.strictEqual(typeof stats.ttl_seconds, "number");
  console.log(`  Passed! Stats retrieved: in_memory_items=${stats.in_memory_items}, threshold=${stats.similarity_threshold}`);

  console.log("\n🎉 ALL SEMANTIC CACHING TESTS PASSED SUCCESSFULLY!\n");
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
