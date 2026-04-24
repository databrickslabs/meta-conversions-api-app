# User Guide

End-to-end walkthrough of setting up a Meta CAPI connection and sending conversion events.

## Prerequisites

Before starting, make sure you have:

- A Databricks workspace
- The [Meta Conversions API marketplace listing](https://marketplace.databricks.com/details/8a8f4ead-db28-45e9-b39b-aabbbe1dbe08/Meta_Meta-Conversions-API) installed
- A Meta Pixel ID and Access Token ([how to generate](https://developers.facebook.com/docs/marketing-api/conversions-api/get-started))
- Permission to read from a SQL warehouse and create Databricks Secrets in your workspace

## Step 1 — Create a connection (Wizard)

Open the app and click **Get Started**.

1. Enter your **Pixel ID** and **Access Token**.
2. (Optional) Enter an **Event Test Code** to validate events in [Meta Events Manager](https://business.facebook.com/events_manager/) before sending production data.
3. Click **Test Connection** — the app sends a test event to Meta's Graph API and reports success or failure.
4. Click **Save**. Your access token is stored in a Databricks Secret scope named `meta_capi_pixel_<pixel_id>` (not saved in localStorage or the browser).

Your connection is now listed under **Existing Connections** on the home page.

## Step 2 — Pick an action

From the connection detail page, choose one of three actions:

### A. Quick Start — Run now with sample data

Runs Meta CAPI events immediately using the Databricks Marketplace sample dataset.

1. Confirm the **Sample Dataset Location** (defaults to `<marketplace-catalog>.meta_capi.conversion_data`).
2. (Optional) Override the Event Test Code.
3. Click **Run Now**.

The app registers a session-scoped temporary UDTF on a running SQL warehouse, reads your access token from Databricks Secrets via the `secret()` SQL function, loads the mapping YAML from the marketplace Unity Catalog Volume, and sends events to Meta's Graph API in batches of 1,000.

Events typically appear in Meta Ads Manager within 30 minutes.

### B. Deploy Notebook — Customize in the workspace

Drops a Meta CAPI UDTF notebook into your Databricks workspace along with the column mapping YAML.

1. Confirm the **Workspace Path** (defaults to your user folder).
2. (Optional) Set an Event Test Code.
3. Click **Deploy to Workspace**.

The notebook is pre-wired with your Pixel ID, secret reference, and the Marketplace sample table. Open it to customize the mapping or extend the logic.

### C. Set Up a Job — Recurring event delivery

A two-step wizard to build a scheduled Databricks Job against your own table.

**Step 1 — Column Mapping.** Map columns from your source table to Meta CAPI parameters. Required transforms (e.g. `sha256` for hashed email, `to_epoch` for event time) are enforced per [Meta's spec](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters). Use table search to pick any Unity Catalog table you have access to.

**Step 2 — Job Configuration.** Choose a job name, schedule (On Demand, Daily, or Weekly), and workspace path. Advanced settings let you override the workspace path. Click **Create Job**.

The app creates a Databricks Job that runs the notebook on the chosen schedule with your mapping and secret references.

## Edit a connection

From the home page, click a connection, then click the pencil icon next to **Access Token** to update the stored secret. The secret scope and key are displayed inline during edit mode only.

## Settings

The gear icon in the lower-left opens Settings:

- Shows the current user, workspace, app name, and version.
- Detects whether the Meta CAPI Marketplace listing is installed in your workspace.
- If the listing isn't detected, you can enter the catalog name manually so the app knows where to find the sample data and mapping YAML.
