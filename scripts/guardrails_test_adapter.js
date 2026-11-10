const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const tsPath = path.resolve(__dirname, "../src/lib/guardrails.ts");
const tsCode = fs.readFileSync(tsPath, "utf8");

const { outputText } = ts.transpileModule(tsCode, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
});

const m = { exports: {} };
const fn = new Function("module", "exports", "require", "__dirname", "__filename", outputText);
fn(m, m.exports, require, path.dirname(tsPath), tsPath);

module.exports = m.exports;
