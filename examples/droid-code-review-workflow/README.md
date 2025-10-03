# Droid Code Review Workflow

This directory contains a sample GitHub Actions workflow that uses Droid to automatically review pull requests in your repository.

## How to use

1.  **Copy the workflow file**:

    Copy the `droid-code-review.yml` file from this directory into your own repository's `.github/workflows/` directory.

2.  **Configure Secrets**:

    This workflow requires one secret to be added to your repository:

    *   `FACTORY_API_KEY`: Your Factory AI API key.

    To get your API key, sign in to Factory, click your profile in the top right, go to **Settings** → **API Keys**, and create a key there. Once created, you won’t be able to view the key again, but you can always generate new ones.

    To add it:

    *   Go to your repository's **Settings** tab.
    *   In the **Security** section of the sidebar, select **Secrets and variables** > **Actions**.
    *   Click **New repository secret**.
    *   Name the secret `FACTORY_API_KEY` and paste your API key into the **Value** field.

    **Note on `GH_TOKEN`**: This workflow uses the built-in `secrets.GITHUB_TOKEN` to interact with the GitHub API. GitHub prevents creating secrets with a `GITHUB_` prefix. For this reason, the workflow assigns `secrets.GITHUB_TOKEN` to an environment variable named `GH_TOKEN`, which the Droid agent then uses. You do not need to create this secret yourself.
    *   Your GitHub Token will need `contents: read`, `pull requests: read and write` and `issues: write` access

4.  **Create a pull request**:

    Once the workflow file and API key are in place, Droid will automatically review any new pull requests you create.
