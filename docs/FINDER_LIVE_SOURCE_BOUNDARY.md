# Finder Live Source Boundary

CoqPi may use live web research connectors for the future Finder module: jobs,
investors, accelerators, partners, and client prospects. It must not become an
outreach bot or broad web crawler.

This note adapts the useful part of `MODSetter/SurfSense`: typed live source
connectors and cited briefs.

Source: https://github.com/MODSetter/SurfSense

## Allowed

- collect public job listings, company pages, accelerator pages, investor/fund
  pages, maps/place profiles, search results, and selected public web pages;
- produce local candidate briefs with citations;
- route candidates into the existing review queue;
- mark quality as `ready`, `usable`, or `weak`;
- prepare call context only after owner selection.

## Not allowed

- automatic outreach;
- sending email, LinkedIn messages, forms, or Telegram messages;
- broad crawling from vague prompts;
- importing unreviewed connector output into durable memory;
- using social or review data as verified truth;
- live-call dependency on external connector availability.

## Run receipt

Every live-source finder run should record:

- `source_family`;
- `connector`;
- `query_or_url_scope`;
- `target_type`;
- `time_window`;
- `rate_or_cost_limit`;
- `candidate_count`;
- `citation_quality`;
- `queue_review_state`;
- `owner_selection_required`.

## Candidate lifecycle

- `COLLECTED`: connector output exists.
- `BRIEFED`: local cited candidate brief exists.
- `QUEUED`: candidate is ready for owner review.
- `HELD`: useful but not now.
- `REJECTED`: bad fit or weak evidence.
- `SELECTED_FOR_PREP`: allowed into Prepare context.

Finder live-source research remains local and review-first.
