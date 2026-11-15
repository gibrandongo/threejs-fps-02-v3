// Settings: sensitivity, volume, bot skill and autopilot, persisted in
// localStorage when available. Loaded once at boot, applied live from
// the pause menu. Storage failures (private mode, file URLs) are silent.
const KEY = 'amberline-settings-v1';
const SKILL_NAMES = ['Rookie', 'Regular', 'Veteran'];

export function loadSettings(S) {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (typeof saved.sens === 'number') S.settings.sens = Math.max(0.2, Math.min(3, saved.sens));
    if (typeof saved.volume === 'number') S.settings.volume = Math.max(0, Math.min(1, saved.volume));
    if (typeof saved.skill === 'number') S.settings.skill = Math.max(0, Math.min(2, saved.skill | 0));
  } catch (e) { /* storage unavailable: defaults stand */ }
}

export function saveSettings(S) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({
      sens: S.settings.sens, volume: S.settings.volume, skill: S.settings.skill,
    }));
  } catch (e) { /* ignore */ }
}

export function applySkill(S) {
  for (const a of S.agents) if (a.bot) a.skill = S.settings.skill;
}

export function skillName(i) { return SKILL_NAMES[i] || 'Regular'; }
