# ChatKit attachment storage decision

Status: superseded for shared lead-intake transport by
`docs/lead-photo-attachments.md`; still current for avoiding permanent photo
archives and for not copying ChatKit attachments into Craig-owned S3 in v1.

Date: 2026-04-18

Update: 2026-04-21

Form photos now use transient Craig-owned S3 storage so the quote form can have
the same practical photo capability as email and chat. This is transport only:
successful workflows delete form S3 objects, abandoned uploads expire after one
day, and chat attachments remain ChatKit references in v1. See
`docs/lead-photo-attachments.md` for the current cross-source policy.

## Decision

Do not introduce or expand Craig-owned S3 attachment storage as the primary
photo system of record right now.

For the current lifecycle, uploaded photos are conversational context. Their job
is to help the customer and the shop move the conversation forward. They are not
currently a long-term job archive, admin asset library, portfolio source, or
quote-management record that requires independent business retention.

## Why

Chat photos currently need to answer a short-lived question:

> What is the customer trying to show us so we can understand the project and
> follow up?

That does not require Craig's backend to own the file forever.

Adding S3 as the source of truth would add infrastructure and policy surface:

- bucket lifecycle rules
- object access rules
- attachment metadata records
- cleanup jobs
- preview/download authorization
- operational monitoring
- extra failure modes in the chat upload path

That complexity is only worth it if the business needs the photos outside the
ChatKit conversation lifecycle.

## Current preferred model

Use ChatKit/OpenAI-hosted attachment behavior for the chat conversation unless a
clear product need requires Craig-owned storage.

Mental model:

```text
Customer uploads photo
  -> ChatKit can use the photo in the conversation
  -> Shop uses the conversation context to follow up
  -> No separate Craig-owned photo archive is created by default
```

This keeps the system simpler and better aligned with the actual use case:
photos help the conversation, but they do not become permanent business assets.

## What S3 would be for later

S3 becomes justified if attachments need to become part of the broader
lead-intake platform, not just the chat conversation.

Revisit S3 if we need any of these:

- Quote form photo uploads outside ChatKit.
- Admin lead pages that browse customer photos.
- Owner emails that must embed photos without depending on ChatKit/OpenAI
  attachment availability.
- A formal lead attachment record linked to `journey_id`, `thread_id`, or
  `lead_record_id`.
- A controlled deletion policy such as 30, 60, or 90 days.
- Consent-based before/after portfolio workflows.
- Image processing such as thumbnail generation, EXIF stripping, malware
  scanning, or compression.

If those needs appear, the clean model is:

```text
DynamoDB = attachment metadata and ownership
S3       = image bytes
ChatKit  = conversation UI/context
```

Until then, S3 is unnecessary complexity.

## Retention stance

Do not keep customer quote/chat photos forever by default.

If Craig-owned storage is introduced later, use short retention by default:

- 30 days if photos are only used for immediate triage.
- 60-90 days if photos need to cover delayed follow-up or scheduling.
- Longer retention only when the photo becomes part of an actual job record.
- Permanent retention only for portfolio/gallery use after an explicit business
  decision and consent process.

The default should be data minimization, not accidental archiving.

## OpenAI context

OpenAI's data controls documentation currently describes ChatKit thread
application state as retained until deleted, and `/v1/files` application state
as retained until deleted, with files deletable manually or with expiration
controls where applicable:

- https://developers.openai.com/api/docs/guides/your-data#storage-requirements-and-retention-controls-per-endpoint

ChatKit attachments can use hosted upload behavior unless a custom backend is
needed:

- https://developers.openai.com/api/docs/guides/chatkit-themes#enable-file-attachments

That means the reason to use S3 is not "OpenAI will immediately lose the
photo." The reason to use S3 would be business ownership, retention control, and
cross-workflow reuse. At the moment, that need is not strong enough.
