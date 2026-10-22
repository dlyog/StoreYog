import 'dotenv/config';
// Native Node LAN access may be denied by macOS while curl is permitted.
process.env.LAB_HTTP_TRANSPORT ||= process.platform === 'darwin' ? 'auto' : 'fetch';
export const config = {
  port: Number(process.env.MCP_PORT || 3101),
  webPort: Number(process.env.PORT || 3100),
  mcpUrl: process.env.MCP_SERVER_URL || `http://127.0.0.1:${process.env.MCP_PORT || 3101}/mcp`,
  mcpApiKey: process.env.MCP_API_KEY || '',
  internalToken: process.env.INTERNAL_TOKEN || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',
  sttUrl: (process.env.TRAINIUM_STT_URL || process.env.local_stt || process.env.STP_API || '').replace(/\/$/, ''),
  ttsUrl: (process.env.TRAINIUM_TTS_URL || process.env.local_tts || process.env.TTS_API || '').replace(/\/$/, ''),
  ttsVoice: process.env.TRAINIUM_TTS_VOICE || 'af_heart',
  llmUrl: (process.env.TRAINIUM_LLM_BASE_URL || process.env.LLM_API || '').replace(/\/$/, ''),
  llmModel: process.env.TRAINIUM_LLM_MODEL || '',
  timezone: process.env.STORE_TIMEZONE || 'America/Los_Angeles',
};
