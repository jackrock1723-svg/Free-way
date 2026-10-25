import { api } from '../../api.js';

export const MAX_STARTUP_COMMAND_LENGTH = 2000;

export function validateStartupCommand(value) {
  if (typeof value !== 'string') return 'Startup command must be text.';
  if (value.length > MAX_STARTUP_COMMAND_LENGTH) return 'Startup command must be 2,000 characters or fewer.';
  if (value.includes('\u0000')) return 'Startup command cannot contain a control character.';
  return '';
}

export const settingsApi = Object.freeze({
  read() {
    return api.request('/api/settings');
  },
  update(patch) {
    return api.request('/api/settings', { method: 'PUT', body: patch });
  },
  readProject(projectId) {
    return api.request(`/api/settings/projects/${encodeURIComponent(projectId)}`);
  },
  readProjectRuntimes(projectId) {
    return api.request(`/api/projects/${encodeURIComponent(projectId)}/runtimes`);
  },
  updateProject(projectId, patch) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'startup_command')) {
      const validationError = validateStartupCommand(patch.startup_command);
      if (validationError) return Promise.reject(new TypeError(validationError));
    }
    return api.request(`/api/settings/projects/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      body: patch,
    });
  },
  readAuthConfig() {
    return api.request('/api/auth/config');
  },
  readAuthSession() {
    return api.request('/api/auth/session');
  },
  readUsage(period = '7d') {
    return api.request(`/api/settings/usage?period=${encodeURIComponent(period)}`);
  },
  readSkills(search = '') {
    return api.request(`/api/settings/skills?search=${encodeURIComponent(search)}`);
  },
  readSkill(skillId) {
    return api.request(`/api/settings/skills/${encodeURIComponent(skillId)}`);
  },
  readBrowserProfiles() {
    return api.request('/api/settings/browser');
  },
  readMcpStatus() {
    return api.request('/api/settings/mcp');
  },
  readProviders() {
    return api.request('/api/settings/providers');
  },
});
