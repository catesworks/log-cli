import { ExtraRuleDocs } from "./types.js";
import { ESLintUtils } from "@typescript-eslint/utils";
//#region src/rules.d.ts
declare const rules: Record<string, ESLintUtils.RuleModule<string, ReadonlyArray<unknown>, ExtraRuleDocs, ESLintUtils.RuleListener>>;
//#endregion
export { rules };
//# sourceMappingURL=rules.d.ts.map