// Maps agentSetting values from Claude Code JSONL to display colors
// agentSetting is the REAL role assigned by Claude Code, not guessed

export interface RoleColors {
  primary: string;
  badge: string;
}

// Known agentSetting values and their colors
const ROLE_COLOR_MAP: Record<string, RoleColors> = {
  "code reviewer":       { primary: "#4aff7a", badge: "#1a4e2a" },
  "explore":             { primary: "#ffda4a", badge: "#5e4e1a" },
  "merge agent":         { primary: "#ff7a4a", badge: "#6e3a1a" },
  "docs agent":          { primary: "#4affda", badge: "#1a5e4e" },
  "ios builder":         { primary: "#4a9eff", badge: "#1a3a6e" },
  "backend builder":     { primary: "#ff9f43", badge: "#6e4a1a" },
  "plan":                { primary: "#b04aff", badge: "#4a1a6e" },
  "claude-code-guide":   { primary: "#7ac4ff", badge: "#1a3e5e" },
  "pipeline lead":       { primary: "#ff6b9d", badge: "#6e1a3a" },
  "pipeline supervisor": { primary: "#ff4a6a", badge: "#6e1a2a" },
  "qa tester":           { primary: "#ff85c0", badge: "#5e1a3e" },
  "security auditor":    { primary: "#ff4a4a", badge: "#6e1a1a" },
  "devops engineer":     { primary: "#4affb0", badge: "#1a5e3e" },
  "performance analyst": { primary: "#dda0ff", badge: "#4a1a5e" },
  "general-purpose":     { primary: "#aaaaaa", badge: "#444444" },
  "boss":                { primary: "#ff0000", badge: "#8b0000" },
  "slave":               { primary: "#888888", badge: "#333333" },
  "worker":              { primary: "#8899aa", badge: "#3a4450" },
};

// Keyword → role mapping for deriving role from description
const DESCRIPTION_ROLE_KEYWORDS: Array<[RegExp, string]> = [
  [/\breview\b/i,      "reviewer"],
  [/\baudit\b/i,       "auditor"],
  [/\bimplement\b/i,   "developer"],
  [/\bbuild\b/i,       "developer"],
  [/\bcreate\b/i,      "developer"],
  [/\badd\b/i,         "developer"],
  [/\bfix\b/i,         "bugFixer"],
  [/\btest\b/i,        "e2eQA"],
  [/\be2e\b/i,         "e2eQA"],
  [/\bvalidate\b/i,    "e2eQA"],
  [/\bmerge\b/i,       "teamLeadMerge"],
  [/\bcleanup\b/i,     "devCleanup"],
  [/\bdocs?\b/i,       "writer"],
  [/\bchangelog\b/i,   "changelogWriter"],
  [/\breadme\b/i,      "writer"],
  [/\bresearch/i,      "researcher"],
  [/\binvestigat/i,    "researcher"],
  [/\bexplor/i,        "researcher"],
  [/\banalyz/i,        "researcher"],
  [/\bdeploy\b/i,      "devOps"],
  [/\binfra\b/i,       "devOps"],
  [/\bci\b/i,          "devOps"],
  [/\barchitect/i,     "itArchitector"],
  [/\bdesign/i,        "designPlanner"],
  [/\bplan/i,          "planner"],
  [/\brefactor/i,      "devRefactor"],
  [/\bmigrat/i,        "devRefactor"],
  [/\bcloseout\b/i,    "closer"],
  [/\bpost.*comment/i, "closer"],
  [/\bmonitor\b/i,     "teamLead"],
  [/\bwatch\b/i,       "teamLead"],
  [/\bsupervis/i,      "teamLead"],
];

// Colors for description-derived roles (visually distinct from gray general-purpose)
const DERIVED_ROLE_COLORS: Record<string, RoleColors> = {
  "reviewer":         { primary: "#4aff7a", badge: "#1a4e2a" },
  "auditor":          { primary: "#ff4a4a", badge: "#6e1a1a" },
  "developer":        { primary: "#4a9eff", badge: "#1a3a6e" },
  "bugfixer":         { primary: "#ff9f43", badge: "#5e3a1a" },
  "e2eqa":            { primary: "#ff85c0", badge: "#5e1a3e" },
  "teamleadmerge":    { primary: "#ff7a4a", badge: "#6e3a1a" },
  "devcleanup":       { primary: "#ff7a4a", badge: "#6e3a1a" },
  "writer":           { primary: "#4affda", badge: "#1a5e4e" },
  "changelogwriter":  { primary: "#4affda", badge: "#1a5e4e" },
  "researcher":       { primary: "#ffda4a", badge: "#5e4e1a" },
  "devops":           { primary: "#4affb0", badge: "#1a5e3e" },
  "planner":          { primary: "#b04aff", badge: "#4a1a6e" },
  "designplanner":    { primary: "#b04aff", badge: "#4a1a6e" },
  "itarchitector":    { primary: "#b04aff", badge: "#4a1a6e" },
  "devrefactor":      { primary: "#dda0ff", badge: "#4a1a5e" },
  "closer":           { primary: "#ff7a4a", badge: "#6e3a1a" },
  "teamlead":         { primary: "#ff4a6a", badge: "#6e1a2a" },
  "worker":           { primary: "#8899aa", badge: "#3a4450" },
  // Level 1: abbreviation-derived roles
  "productmanager":   { primary: "#ff6b9d", badge: "#6e1a3a" },
  "projectmanager":   { primary: "#ff6b9d", badge: "#6e1a3a" },
  "qaengineer":       { primary: "#ff85c0", badge: "#5e1a3e" },
  "techlead":         { primary: "#ff4a6a", badge: "#6e1a2a" },
  "execlead":         { primary: "#ff4a6a", badge: "#6e1a2a" },
  "dbaadmin":         { primary: "#dda0ff", badge: "#4a1a5e" },
  "sitereliability":  { primary: "#4affb0", badge: "#1a5e3e" },
  "testengineer":     { primary: "#ff85c0", badge: "#5e1a3e" },
  "uxdesigner":       { primary: "#b04aff", badge: "#4a1a6e" },
  "uidesigner":       { primary: "#b04aff", badge: "#4a1a6e" },
  "frontenddev":      { primary: "#4a9eff", badge: "#1a3a6e" },
  "backenddev":       { primary: "#ff9f43", badge: "#6e4a1a" },
  "mlengineer":       { primary: "#ffda4a", badge: "#5e4e1a" },
  "aiengineer":       { primary: "#ffda4a", badge: "#5e4e1a" },
  "datascientist":    { primary: "#ffda4a", badge: "#5e4e1a" },
  "dataengineer":     { primary: "#ffda4a", badge: "#5e4e1a" },
  "bizanalyst":       { primary: "#ff6b9d", badge: "#6e1a3a" },
  "sysadmin":         { primary: "#4affb0", badge: "#1a5e3e" },
  "techarchitect":    { primary: "#b04aff", badge: "#4a1a6e" },
  "engmanager":       { primary: "#ff4a6a", badge: "#6e1a2a" },
  "scrummaster":      { primary: "#ff6b9d", badge: "#6e1a3a" },
  // Level 2: domain combo roles
  "secreviewer":      { primary: "#ff4a4a", badge: "#6e1a1a" },
  "archreviewer":     { primary: "#4aff7a", badge: "#1a4e2a" },
  "perfreviewer":     { primary: "#4aff7a", badge: "#1a4e2a" },
  "prreviewer":       { primary: "#4aff7a", badge: "#1a4e2a" },
  "iosdev":           { primary: "#4a9eff", badge: "#1a3a6e" },
  "testwriter":       { primary: "#4affda", badge: "#1a5e4e" },
  "perfanalyst":      { primary: "#dda0ff", badge: "#4a1a5e" },
  "secanalyst":       { primary: "#ff4a4a", badge: "#6e1a1a" },
  "dataanalyst":      { primary: "#ffda4a", badge: "#5e4e1a" },
  "releasemanager":   { primary: "#ff7a4a", badge: "#6e3a1a" },
  "techwriter":       { primary: "#4affda", badge: "#1a5e4e" },
  "infraengineer":    { primary: "#4affb0", badge: "#1a5e3e" },
  "perfengineer":     { primary: "#dda0ff", badge: "#4a1a5e" },
  "secengineer":      { primary: "#ff4a4a", badge: "#6e1a1a" },
};

// Normalize raw agentSetting to human-friendly display role
const AGENT_SETTING_DISPLAY_NAMES: Record<string, string> = {
  "plan":              "planner",
  "explore":           "devExplorer",
  "code reviewer":     "codeReviewer",
  "merge agent":       "teamLeadMerger",
  "docs agent":        "docWriter",
  "ios builder":       "iosDev",
  "backend builder":   "backendDev",
  "qa tester":         "QA",
  "claude-code-guide": "guide",
  "general-purpose":   "worker",
};

// ── Level 1: Direct role/abbreviation mentions ─────────────────────────
// Patterns like "as PM", "act as QA", or standalone abbreviations in text
const ABBREVIATION_MAP: Record<string, string> = {
  "pm":         "productManager",
  "qa":         "qaEngineer",
  "cto":        "techLead",
  "ceo":        "execLead",
  "dba":        "dbaAdmin",
  "sre":        "siteReliability",
  "devops":     "devOps",
  "sdet":       "testEngineer",
  "ux":         "uxDesigner",
  "ui":         "uiDesigner",
  "fe":         "frontendDev",
  "be":         "backendDev",
  "ml":         "mlEngineer",
  "ai":         "aiEngineer",
  "ds":         "dataScientist",
  "de":         "dataEngineer",
  "ba":         "bizAnalyst",
  "sa":         "sysAdmin",
  "ta":         "techArchitect",
  "tl":         "techLead",
  "em":         "engManager",
  "scrum master": "scrumMaster",
  "tech lead":  "techLead",
  "team lead":  "teamLead",
  "product manager": "productManager",
  "project manager": "projectManager",
  "engineering manager": "engManager",
  "data scientist": "dataScientist",
  "data engineer": "dataEngineer",
  "site reliability": "siteReliability",
};

// "as X" / "act as X" pattern extraction
const AS_ROLE_PATTERN = /\b(?:act\s+)?as\s+(?:a\s+|an\s+)?(.+?)(?:\s+and\b|\s+to\b|\s+for\b|$)/i;

function extractRoleFromAbbreviations(text: string): string | null {
  const lower = text.toLowerCase();
  // Check "as X" pattern first
  const asMatch = lower.match(AS_ROLE_PATTERN);
  if (asMatch) {
    const roleText = asMatch[1].trim();
    // Check if the extracted role is a known abbreviation or full name
    if (ABBREVIATION_MAP[roleText]) return ABBREVIATION_MAP[roleText];
    // Check individual words in the role text
    for (const word of roleText.split(/\s+/)) {
      if (ABBREVIATION_MAP[word]) return ABBREVIATION_MAP[word];
    }
  }
  // Check for standalone abbreviations (uppercase 2-3 letter words)
  for (const [abbr, role] of Object.entries(ABBREVIATION_MAP)) {
    if (abbr.length <= 3) {
      // Match uppercase abbreviation as whole word
      const re = new RegExp(`\\b${abbr}\\b`, "i");
      if (re.test(text)) return role;
    } else {
      // Match full phrases
      if (lower.includes(abbr)) return role;
    }
  }
  return null;
}

// ── Level 2: Domain combo (action + context → precise role) ────────────
const DOMAIN_COMBOS: Array<{ action: RegExp; context: RegExp; role: string }> = [
  { action: /\breview/i,    context: /\bsecur/i,              role: "secReviewer" },
  { action: /\breview/i,    context: /\barchitect/i,          role: "archReviewer" },
  { action: /\breview/i,    context: /\bperform/i,            role: "perfReviewer" },
  { action: /\breview/i,    context: /\bPR\b|pull.?req/i,     role: "prReviewer" },
  { action: /\bbuild/i,     context: /\biOS\b|swift|xcode/i,  role: "iosDev" },
  { action: /\bbuild/i,     context: /\bUI\b|frontend|react/i,role: "frontendDev" },
  { action: /\bbuild/i,     context: /\bbackend|server|api/i, role: "backendDev" },
  { action: /\bcreate/i,    context: /\bUI\b|mockup|design|figma/i, role: "uiDesigner" },
  { action: /\bcreate/i,    context: /\btest|spec/i,          role: "testWriter" },
  { action: /\banalyz/i,    context: /\bperform/i,            role: "perfAnalyst" },
  { action: /\banalyz/i,    context: /\bsecur/i,              role: "secAnalyst" },
  { action: /\banalyz/i,    context: /\bdata/i,               role: "dataAnalyst" },
  { action: /\bmanag/i,     context: /\bsprint|backlog|scrum/i, role: "scrumMaster" },
  { action: /\bmanag/i,     context: /\bproject|timeline/i,   role: "projectManager" },
  { action: /\bmanag/i,     context: /\brelease|deploy/i,     role: "releaseManager" },
  { action: /\bwrite/i,     context: /\bdoc|summary|readme/i, role: "techWriter" },
  { action: /\bwrite/i,     context: /\btest|spec/i,          role: "testWriter" },
  { action: /\bset.?up/i,   context: /\bCI|CD|pipeline/i,     role: "devOps" },
  { action: /\bset.?up/i,   context: /\binfra|server|cloud/i, role: "infraEngineer" },
  { action: /\bfix/i,       context: /\bperform/i,            role: "perfEngineer" },
  { action: /\bfix/i,       context: /\bsecur/i,              role: "secEngineer" },
  { action: /\bfix/i,       context: /\bUI\b|layout|css/i,    role: "frontendDev" },
  { action: /\bdeploy/i,    context: /\bios|app.?store/i,     role: "iosDev" },
  { action: /\boptimiz/i,   context: /\bperform|speed|latency/i, role: "perfEngineer" },
  { action: /\boptimiz/i,   context: /\bquery|sql|database/i, role: "dbaAdmin" },
  { action: /\bmigrat/i,    context: /\bdata|database|db/i,   role: "dataEngineer" },
  { action: /\bmigrat/i,    context: /\bcloud|infra|server/i, role: "infraEngineer" },
];

function extractRoleFromDomainCombo(text: string): string | null {
  for (const { action, context, role } of DOMAIN_COMBOS) {
    if (action.test(text) && context.test(text)) return role;
  }
  return null;
}

// ── Level 4: Compact fallback ──────────────────────────────────────────
function toCamelCase(text: string, maxLen: number): string {
  const words = text.split(/[\s\-_]+/).filter(Boolean);
  if (words.length === 0) return "worker";
  const camel = words[0].toLowerCase() + words.slice(1).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
  if (camel.length <= maxLen) return camel;
  const shortened = words.map(w => w.toLowerCase());
  for (let iter = 0; iter < 50; iter++) {
    const result = shortened[0] + shortened.slice(1).map(w => w[0].toUpperCase() + w.slice(1)).join("");
    if (result.length <= maxLen) return result;
    let maxWord = 0, maxWordLen = 0;
    for (let i = 0; i < shortened.length; i++) {
      if (shortened[i].length > maxWordLen) { maxWordLen = shortened[i].length; maxWord = i; }
    }
    if (maxWordLen <= 3) break;
    shortened[maxWord] = shortened[maxWord].slice(0, Math.max(3, maxWordLen - 1));
  }
  const result = shortened[0] + shortened.slice(1).map(w => w[0].toUpperCase() + w.slice(1)).join("");
  return result.slice(0, maxLen);
}

/**
 * Extract profession from description using 4-level pipeline:
 * 1. Direct role/abbreviation mentions (PM, QA, "as X")
 * 2. Domain combos (action + context → precise role)
 * 3. Single keyword matching (existing table)
 * 4. camelCase compact fallback
 */
function extractProfession(description: string): string {
  // Level 1: abbreviations and explicit role mentions
  const abbr = extractRoleFromAbbreviations(description);
  if (abbr) return abbr;

  // Level 2: domain combos (action + context)
  const combo = extractRoleFromDomainCombo(description);
  if (combo) return combo;

  // Level 3: single keyword matching (DESCRIPTION_ROLE_KEYWORDS)
  for (const [pattern, role] of DESCRIPTION_ROLE_KEYWORDS) {
    if (pattern.test(description)) return role;
  }

  // Level 4: camelCase compact fallback
  return toCamelCase(description, 15);
}

// Default for unknown agentSetting values
const DEFAULT_COLORS: RoleColors = { primary: "#cccccc", badge: "#555555" };

export function getRoleColors(role: string): RoleColors {
  return ROLE_COLOR_MAP[role.toLowerCase()] || DERIVED_ROLE_COLORS[role.toLowerCase()] || DEFAULT_COLORS;
}

/**
 * Derive a meaningful display role from agentSetting + description.
 * When agentSetting is "general-purpose", extract a role keyword from description.
 * Top-level agents (not subagents) without agentSetting get "boss" role.
 * Returns { displayRole, colors }.
 */
export function resolveDisplayRole(
  agentSetting: string | undefined,
  description: string | undefined,
  isSubagent?: boolean,
): { displayRole: string; colors: RoleColors } {
  // If agentSetting is a known meaningful role, normalize and use it
  if (agentSetting && agentSetting.toLowerCase() !== "general-purpose") {
    const normalized = AGENT_SETTING_DISPLAY_NAMES[agentSetting.toLowerCase()];
    const displayName = normalized || agentSetting;
    return {
      displayRole: displayName,
      colors: getRoleColors(agentSetting), // colors keyed by original agentSetting
    };
  }

  // agentSetting is "general-purpose" or missing — extract profession from description
  if (description) {
    const role = extractProfession(description);
    return {
      displayRole: role,
      colors: DERIVED_ROLE_COLORS[role.toLowerCase()] || { primary: "#b0b0ff", badge: "#3a3a5e" },
    };
  }

  // No agentSetting and no description — top-level agents are "boss"
  if (!agentSetting && !isSubagent) {
    return { displayRole: "boss", colors: getRoleColors("boss") };
  }

  if (!agentSetting) {
    return { displayRole: "worker", colors: getRoleColors("worker") };
  }

  // agentSetting is "general-purpose" with no useful description
  return {
    displayRole: "worker",
    colors: getRoleColors("worker"),
  };
}
