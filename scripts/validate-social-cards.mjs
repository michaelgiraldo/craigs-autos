import { validateSocialCards } from '../src/lib/social-cards/validateSocialCards.js';

const errors = validateSocialCards();

if (errors.length > 0) {
  console.error('Social card validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Social card validation passed.');
