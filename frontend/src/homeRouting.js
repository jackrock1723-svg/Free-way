// Home box routing: the server decides what is a task. A greeting/question comes back as a "chit-chat" refusal,
// which Home turns into an inline chat reply instead of an error banner.
const CHITCHAT = /looks like a greeting|not a task/i;

export function isChitChatError(error) {
  if (!error) return false;
  return CHITCHAT.test(`${error.message || ''} ${error.detail || ''}`);
}

// Step 5 intent router for the Home composer in Build mode. Fast local rules only (no model call).
// Returns 'build' only for a clear action request with something to act on; everything else, including
// anything uncertain, is 'chat'. Chat never starts a build: the reply offers an explicit "Start build" button.
const GREETING = /^(hi+|hello+|hey+|hai|helo|yo|sup|vanakkam|namaste|namaskaram|good (morning|afternoon|evening|night)|thanks?|thank you|thx|ty|ok(ay)?|cool|nice|great|bye|gm|gn)\b/;
const ACTION = '(add|create|build|make|plan|fix|change|refactor|implement|update|rename|delete|remove|write|generate|set ?up|install|move|replace|convert|migrate|optimi[sz]e|improve|restyle|redesign|deploy|translate|integrate)';
const POLITE = '(?:(?:please|pls|plz|kindly|can you|could you|would you|will you|i want you to|i need you to|let\'?s|lets|go ahead and)\\s+)*';
const ACTION_FIRST = new RegExp(`^${POLITE}${ACTION}\\b\\s+(.+)`);
const ACTION_ANY = new RegExp(`\\b${ACTION}\\b`);
const QUESTION = /^(what|whats|why|how|when|where|who|whom|which|explain|describe|tell me|is|are|am|does|do|did|can|could|should|would|will|was|were|has|have|enna|ennaa|epdi|eppadi|yen|ethu|edhu|idhu|ithu|enaku|sollu)\b/;
const TARGET = /\b(page|pages|app|apps|button|buttons|file|files|function|functions|component|components|bug|bugs|error|errors|login|signup|sign-in|form|forms|api|endpoint|route|test|tests|calculator|website|site|landing|screen|header|footer|navbar|nav|menu|css|style|styles|theme|feature|features|database|db|table|schema|model|class|module|script|readme|docs?|index|html|game|todo|dashboard|section|layout|image|logo|text|line|link|modal|dialog|server|backend|frontend|ui|crash|issue)\b|[\w-]+\.(js|jsx|ts|tsx|py|css|html|md|json|yml|yaml|java|go|rs|c|cpp|php|rb)\b|`[^`]+`|\/[\w.-]+/;

export function routeIntent(input) {
  const text = String(input || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return 'chat';
  const bare = text.replace(/[!?.,…]+$/g, '').trim();
  const words = bare.split(' ').filter(Boolean);
  if (GREETING.test(bare) && words.length <= 4) return 'chat';
  const lead = bare.match(ACTION_FIRST);
  if (lead && (TARGET.test(lead[2]) || lead[2].split(' ').length >= 2)) return 'build';   // "build a calculator", "fix the login bug"
  if (QUESTION.test(bare) || text.endsWith('?')) return 'chat';                          // questions, "idhu enna", "what does this do?"
  if (ACTION_ANY.test(bare) && TARGET.test(bare) && words.length >= 3) return 'build';   // "the login page needs a fix ... add a button"
  return 'chat';                                                                          // uncertain: chat, with a Start build offer
}