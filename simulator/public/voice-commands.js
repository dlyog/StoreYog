// Shared with focused tests; these commands are handled locally, never sent as store requests.
export const WELCOME='Welcome to StoreYog, your store assistant. How can I help you today?';
export const GOODBYE='Goodbye! See you next time.';
export const MICROPHONE_OFF='Goodbye! Listening stopped. Your microphone is off.';
export function isStopListening(text){
 if(/\bstop\b/i.test(text))return true;
 const value=text.trim().toLowerCase().replace(/^alexa[,\s]+/,'').replace(/[.!?]+$/,'').trim();
 return /^(?:please\s+)?(?:stop(?:\s+listening)?|stop\s+the\s+(?:mic|microphone)|(?:mic|microphone)\s+off|turn\s+off\s+(?:the\s+)?(?:mic|microphone)|mute\s+(?:the\s+)?(?:mic|microphone))(?:[,\s]+please)?$/.test(value);
}
