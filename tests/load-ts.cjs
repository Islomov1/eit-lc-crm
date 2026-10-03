const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");
module.exports = function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (file.endsWith("/src/lib/prisma.ts") && mocks["@/lib/prisma"])
      return mocks["@/lib/prisma"];
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    vm.runInNewContext(
      code,
      {
        exports,
        process,
        console,
        Date,
        URL,
        URLSearchParams,
        Request,
        Response,
        Headers,
        FormData,
        Buffer,
        setTimeout,
        clearTimeout,
        AbortSignal,
        fetch,
        require(name) {
          if (name in mocks) return mocks[name];
          if (name.startsWith("@/"))
            return load(path.join(__dirname, "../src", name.slice(2)) + ".ts");
          if (name.startsWith("."))
            return load(path.resolve(path.dirname(file), name) + ".ts");
          return require(name);
        },
      },
      { filename: file },
    );
    return exports;
  }
  return load;
};
