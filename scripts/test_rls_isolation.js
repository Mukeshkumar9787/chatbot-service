const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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
      if (fs.existsSync(resolved + ".ts")) {
        return loadTsModule(path.relative(__dirname, resolved + ".ts"));
      }
      if (fs.existsSync(path.join(resolved, "index.ts"))) {
        return loadTsModule(path.relative(__dirname, path.join(resolved, "index.ts")));
      }
    }
    return require(reqPath);
  };
  const fn = new Function("module", "exports", "require", "__dirname", "__filename", outputText);
  fn(m, m.exports, customRequire, path.dirname(tsPath), tsPath);
  cache[tsPath] = m.exports;
  return m.exports;
}

// Load env
const envContent = fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8");
for (const line of envContent.split("\n")) {
  if (line.startsWith("DATABASE_URL=")) {
    process.env.DATABASE_URL = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    break;
  }
}

const { dbChatStore, dbUserStore } = loadTsModule("../src/lib/db.ts");
const { runWithTenant, runWithBypass } = loadTsModule("../src/lib/tenantContext.ts");
const { sequelize } = loadTsModule("../src/models/index.ts");

async function runRlsTests() {
  console.log("=== RUNNING POSTGRESQL RLS ENFORCEMENT & ISOLATION TESTS (CHATBOT-SERVICE) ===");

  const tenantAlpha = "tenant_rls_alpha_" + Date.now();
  const tenantBeta = "tenant_rls_beta_" + Date.now();
  const conversationId = "conv_" + crypto.randomUUID();

  try {
    // 1. Create a conversation and save a message in tenantAlpha
    console.log(`\n[Test 1] Saving conversation and message under ${tenantAlpha}`);
    const conv = await runWithTenant(tenantAlpha, async () => {
      const c = await dbChatStore.getOrCreateConversation({
        conversationId,
        title: "Test RLS Conv Alpha",
        tenantId: tenantAlpha,
      });

      await dbChatStore.saveMessage({
        conversationId,
        role: "user",
        content: "Secret prompt for Tenant Alpha",
        tenantId: tenantAlpha,
      });

      return c;
    });
    assert.strictEqual(conv.id, conversationId, "Conversation ID must match");
    console.log("  Passed! Record persisted in Tenant Alpha.");

    // 2. Query messages as tenantAlpha -> should find 1 message
    console.log(`\n[Test 2] Query messages under ${tenantAlpha}`);
    const alphaMsgs = await runWithTenant(tenantAlpha, async () => {
      return await dbChatStore.getMessages(conversationId, tenantAlpha);
    });
    assert.strictEqual(alphaMsgs.length, 1, "Should find 1 message for Alpha");
    assert.strictEqual(alphaMsgs[0].content, "Secret prompt for Tenant Alpha");
    console.log("  Passed! Alpha successfully retrieved its own message.");

    // 3. Query the same conversation under tenantBeta -> MUST return 0 messages due to RLS
    console.log(`\n[Test 3] Query same conversation as ${tenantBeta} (RLS Cross-Tenant Boundary)`);
    const betaMsgs = await runWithTenant(tenantBeta, async () => {
      return await dbChatStore.getMessages(conversationId, tenantBeta);
    });
    assert.strictEqual(betaMsgs.length, 0, "Tenant Beta MUST NOT see Tenant Alpha's messages!");
    console.log("  Passed! Tenant Beta returned 0 rows (RLS enforced).");

    // 4. Test low-level SQL query with SET ROLE prisma_application
    console.log(`\n[Test 4] Verify RLS directly at PostgreSQL database level`);
    const [rawAlpha] = await sequelize.query(
      `SELECT count(*)::int as count FROM messages WHERE conversation_id = '${conversationId}'`
    );
    // Since our hook executes with current tenant context (default or last), test explicitly
    const rawDirectCount = await runWithTenant(tenantBeta, async () => {
      const [res] = await sequelize.query(
        `SELECT count(*)::int as count FROM messages WHERE conversation_id = '${conversationId}'`
      );
      return res[0].count;
    });
    assert.strictEqual(rawDirectCount, 0, "Direct SQL under tenantBeta context MUST return 0 rows");
    console.log("  Passed! Direct SQL query under tenantBeta returned count: 0.");

    // 5. Query under bypass context -> sees the record
    console.log(`\n[Test 5] Query under admin bypass context`);
    const bypassMsgs = await runWithBypass(async () => {
      return await dbChatStore.getMessages(conversationId);
    });
    assert.strictEqual(bypassMsgs.length, 1, "Bypass context should see all messages");
    console.log("  Passed! Bypass context retrieved message.");

    // 6. Create User in tenantAlpha
    console.log(`\n[Test 6] Create user under ${tenantAlpha}`);
    const userEmail = `admin_${Date.now()}@example.com`;
    const createdUser = await runWithTenant(tenantAlpha, async () => {
      return await dbUserStore.createOrUpdateUser(
        {
          email: userEmail,
          name: "Tenant Alpha Admin",
          role: "SUPPORT_ADMIN",
          password: "secure_password_123",
          tenant_id: tenantAlpha,
        },
        tenantAlpha
      );
    });
    assert.strictEqual(createdUser.email, userEmail, "Created user email must match");
    console.log("  Passed! User persisted under Tenant Alpha.");

    // 7. Query users under tenantAlpha -> should find createdUser
    console.log(`\n[Test 7] Query users under ${tenantAlpha}`);
    const alphaUsers = await runWithTenant(tenantAlpha, async () => {
      return await dbUserStore.getUsers(tenantAlpha);
    });
    const foundAlpha = alphaUsers.find((u) => u.email === userEmail);
    assert.ok(foundAlpha, "Tenant Alpha must be able to list its own user");
    const alphaUserByEmail = await runWithTenant(tenantAlpha, async () => {
      return await dbUserStore.getUserByEmail(userEmail, tenantAlpha);
    });
    assert.ok(alphaUserByEmail, "Tenant Alpha must be able to get its own user by email");
    console.log("  Passed! Alpha successfully retrieved its own user.");

    // 8. Query same user under tenantBeta -> MUST return null / 0 users due to RLS
    console.log(`\n[Test 8] Query users under ${tenantBeta} (RLS Cross-Tenant Boundary on users)`);
    const betaUsers = await runWithTenant(tenantBeta, async () => {
      return await dbUserStore.getUsers(tenantBeta);
    });
    const foundBeta = betaUsers.find((u) => u.email === userEmail);
    assert.strictEqual(foundBeta, undefined, "Tenant Beta MUST NOT see Tenant Alpha's users in list!");

    const betaUserByEmail = await runWithTenant(tenantBeta, async () => {
      return await dbUserStore.getUserByEmail(userEmail, tenantBeta);
    });
    assert.strictEqual(betaUserByEmail, null, "Tenant Beta MUST NOT see Tenant Alpha's user by email!");

    const rawUserBetaCount = await runWithTenant(tenantBeta, async () => {
      const [res] = await sequelize.query(
        `SELECT count(*)::int as count FROM users WHERE email = '${userEmail}'`
      );
      return res[0].count;
    });
    assert.strictEqual(rawUserBetaCount, 0, "Direct SQL under tenantBeta context MUST return 0 rows for users");
    console.log("  Passed! Tenant Beta cannot see Tenant Alpha's users via API or direct SQL (RLS enforced).");

    console.log("\n🎉 ALL CHATBOT POSTGRESQL RLS ENFORCEMENT & ISOLATION TESTS PASSED!");
  } finally {
    // Cleanup test records
    await runWithBypass(async () => {
      await sequelize.query(`DELETE FROM messages WHERE conversation_id = '${conversationId}'`);
      await sequelize.query(`DELETE FROM conversations WHERE id = '${conversationId}'`);
      await sequelize.query(`DELETE FROM users WHERE email LIKE 'admin_%@example.com'`);
    });
    await sequelize.close();
  }
}

runRlsTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
