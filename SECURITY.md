# Security policy

## Supported version

Security fixes are applied to the latest release.

## Reporting

Please use GitHub's **Report a vulnerability** flow in the repository Security tab. Do not open a public issue containing credentials, transcripts, personal context, OAuth tokens, or exploit details.

## Sensitive local data

CoqPi stores local runtime data outside the repository. Never commit:

- `.env` files or API/OAuth credentials;
- profile or scenario content containing personal facts;
- audio, transcripts, training journals, session exports, or smoke notes;
- context manifests, receipts, or Finder records containing real people or organizations.

Run `pnpm test:public-boundary` before submitting a change.
