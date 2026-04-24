# Meta Conversions API App — Documentation

`conversions-api-app` is a Databricks App that gives Meta's customers — businesses that run ads on Facebook and Instagram — a guided, UI-driven way to send server-side conversion events from their Databricks Lakehouse to [Meta's Conversions API (CAPI)](https://developers.facebook.com/docs/marketing-api/conversions-api/).

It's a companion to the [Meta Conversions API Marketplace listing](https://marketplace.databricks.com/details/8a8f4ead-db28-45e9-b39b-aabbbe1dbe08/Meta_Meta-Conversions-API), which Databricks hosts on Meta's behalf.

## Who this is for

Marketing and ad-ops teams at businesses that advertise on Meta platforms, who need to send server-side conversion events to Meta but don't want to write SQL, manage Databricks Secrets by hand, or configure UDTF arguments in a notebook.

## What's in these docs

| Doc | What it covers |
|---|---|
| [User Guide](./user-guide.md) | Step-by-step walkthrough of the Wizard, Quick Start, Deploy Notebook, and Job Setup flows |
| [Architecture](./architecture.md) | System components, runtime flow, and before/after CUJ diagrams |
| [Deployment](./deployment.md) | How to deploy the app to a Databricks workspace |
| [Troubleshooting](./troubleshooting.md) | Common errors, gotchas, and how to fix them |

## Getting started

Most users will install the companion app through the Marketplace listing. If you're deploying directly from this repo, start with the [Deployment guide](./deployment.md).

## Contributing

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) in the repo root for development setup, testing, and the PR process.
