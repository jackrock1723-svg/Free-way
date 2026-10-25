// Home box routing: the server decides what is a task. A greeting/question comes back as a "chit-chat" refusal,
// which Home turns into an inline chat reply instead of an error banner.
const CHITCHAT = /looks like a greeting|not a task/i;

export function isChitChatError(error) {
  if (!error) return false;
  return CHITCHAT.test(`${error.message || ''} ${error.detail || ''}`);
}
