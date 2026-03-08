import './dom-utils.js';
import './extraction.js';
import './picker.js';
import { initColorBlindnessFilters } from './simulation.js';
import './focus-audit.js';
import './theme-audit.js';
import './mutation.js';
import './message-handler.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initColorBlindnessFilters, {
    once: true,
  });
} else {
  initColorBlindnessFilters();
}
