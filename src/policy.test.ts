import assert from "node:assert/strict";
import { enforce, enforceDeep, violations, normalizeHandle } from "./policy.js";

assert.equal(enforce("this is illegal"), "this is unlawful");
assert.equal(enforce("ILLEGAL moves"), "UNLAWFUL moves");
assert.equal(enforce("Illegally funded"), "Unlawfully funded");
assert.equal(enforce("contact dev@example.com now"), "contact [redacted] now");
assert.equal(enforce("@deployer_dan sold"), "@deployer_dan sold");
assert.equal(enforce("call +1 (555) 123-4567"), "call [redacted]");
assert.equal(enforce("real name: John Smith, deployer"), "[redacted], deployer");
assert.equal(enforce("aka Jane Doe"), "[redacted]");
assert.equal(enforce("lives at 221 Baker Street"), "lives at [redacted]");
assert.equal(enforce("moved 1,250,000 tokens at 2024-01-02 12:00"), "moved 1,250,000 tokens at 2024-01-02 12:00");
assert.equal(enforce(enforce("illegal dev@x.io")), enforce("illegal dev@x.io"));
assert.deepEqual(violations("clean sentence about @handle and 400 SOL"), []);
assert.ok(violations("something illegal").length === 1);
assert.equal(normalizeHandle(" @Deployer_Dan "), "@deployer_dan");
assert.deepEqual(enforceDeep({ a: ["illegal", { b: "x@y.com" }], n: 1 }), { a: ["unlawful", { b: "[redacted]" }], n: 1 });
console.log("policy: ok");
