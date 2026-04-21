import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const projectDirectory = path.join(repoRoot, 'amplify');
const compilerCandidates = [
  path.join(
    repoRoot,
    'node_modules/@aws-amplify/backend-cli/node_modules/@aws-amplify/backend-deployer/lib/ts_compiler.js',
  ),
  path.join(repoRoot, 'node_modules/@aws-amplify/backend-deployer/lib/ts_compiler.js'),
];

const compilerPath = compilerCandidates.find((candidate) => existsSync(candidate));

if (!compilerPath) {
  console.error('Could not find the installed Amplify backend deployer compiler.');
  console.error('Run npm ci, then retry npm run verify:amplify-deploy-compiler.');
  process.exit(1);
}

try {
  const { compileProject } = await import(pathToFileURL(compilerPath).href);
  compileProject(projectDirectory);
  console.log('Amplify backend deploy compiler passed.');
} catch (error) {
  console.error(error?.name ?? 'AmplifyDeployCompilerError');
  console.error(error?.message ?? error);

  if (error?.details) {
    console.error(error.details);
  }

  process.exit(1);
}
