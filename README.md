# Craig's Auto Upholstery website (Astro + ChatKit)

Multi-locale website for Craig's Auto Upholstery, deployed on AWS Amplify. Includes a production ChatKit-powered lead intake chat that emails the shop a transcript + internal AI summary.

## Key documentation

- `docs/README.md`
- `docs/chatkit/overview.md`

## Local development

Install deps:

```sh
npm ci
```

Create `.env.local` at the repo root (do not commit it):

```sh
OPENAI_API_KEY=sk-...
CHATKIT_WORKFLOW_ID=wf_...
```

Run the site + a local ChatKit session endpoint:

```sh
npm run dev:local
```

Then open:

- `http://localhost:4321/en/`

## Deployment

- AWS Amplify is connected to branches; commit + push triggers deploy.
- ChatKit workflow edits in OpenAI Agent Builder apply immediately (the site references a `wf_...` id), no deploy required.
