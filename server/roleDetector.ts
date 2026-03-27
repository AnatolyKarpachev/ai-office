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
  [/\breview\b/i,           "reviewer"],
  [/\baudit\b/i,            "auditor"],
  [/\bimplement|build|create|add\b/i, "builder"],
  [/\bfix\b/i,              "fixer"],
  [/\btest|e2e|validate\b/i, "tester"],
  [/\bmerge|cleanup\b/i,    "merger"],
  [/\bdocs?|changelog|readme\b/i, "writer"],
  [/\bresearch|investigat|explor|analyz/i, "researcher"],
  [/\bdeploy|infra|ci\b/i,  "devops"],
  [/\bplan|design|architect/i, "planner"],
  [/\brefactor|migrat/i,    "refactorer"],
  [/\bcloseout|post.*comment/i, "closer"],
  [/\bmonitor|watch|supervis/i, "supervisor"],
];

// Colors for description-derived roles (visually distinct from gray general-purpose)
const DERIVED_ROLE_COLORS: Record<string, RoleColors> = {
  "reviewer":    { primary: "#4aff7a", badge: "#1a4e2a" },
  "auditor":     { primary: "#ff4a4a", badge: "#6e1a1a" },
  "builder":     { primary: "#4a9eff", badge: "#1a3a6e" },
  "fixer":       { primary: "#ff9f43", badge: "#5e3a1a" },
  "tester":      { primary: "#ff85c0", badge: "#5e1a3e" },
  "merger":      { primary: "#ff7a4a", badge: "#6e3a1a" },
  "writer":      { primary: "#4affda", badge: "#1a5e4e" },
  "researcher":  { primary: "#ffda4a", badge: "#5e4e1a" },
  "devops":      { primary: "#4affb0", badge: "#1a5e3e" },
  "planner":     { primary: "#b04aff", badge: "#4a1a6e" },
  "refactorer":  { primary: "#dda0ff", badge: "#4a1a5e" },
  "closer":      { primary: "#ff7a4a", badge: "#6e3a1a" },
  "supervisor":  { primary: "#ff4a6a", badge: "#6e1a2a" },
  "worker":      { primary: "#8899aa", badge: "#3a4450" },
};

// Normalize raw agentSetting to human-friendly display role
const AGENT_SETTING_DISPLAY_NAMES: Record<string, string> = {
  "plan":              "planner",
  "explore":           "explorer",
  "code reviewer":     "reviewer",
  "merge agent":       "merger",
  "docs agent":        "writer",
  "ios builder":       "builder",
  "backend builder":   "builder",
  "qa tester":         "tester",
  "claude-code-guide": "guide",
  "general-purpose":   "worker",
};

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

  // agentSetting is "general-purpose" or missing — try to derive from description
  if (description) {
    for (const [pattern, role] of DESCRIPTION_ROLE_KEYWORDS) {
      if (pattern.test(description)) {
        return {
          displayRole: role,
          colors: DERIVED_ROLE_COLORS[role] || DEFAULT_COLORS,
        };
      }
    }
    // No keyword match — use truncated description as role
    const short = description.length > 20 ? description.slice(0, 20) + "\u2026" : description;
    return {
      displayRole: short,
      colors: { primary: "#b0b0ff", badge: "#3a3a5e" },
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
