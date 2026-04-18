import { generateSocialImages } from './social-images/pipeline.mjs';

generateSocialImages().catch((error) => {
  console.error(`Social image generation failed: ${error.message}`);
  process.exit(1);
});
