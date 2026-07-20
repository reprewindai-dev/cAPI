# Deploying to Coolify on Hetzner

This project is fully ready to be deployed to a Coolify instance (e.g., hosted on Hetzner) using the provided `Dockerfile` or Nixpacks.

## Option 1: Docker (Recommended)
Coolify can automatically detect the `Dockerfile` at the root of the repository.

1. Connect your repository to your Coolify instance.
2. Create a new Resource in Coolify and select **Project / Application**.
3. Choose the repository and branch.
4. Coolify will auto-detect the configuration. Under the **Build Pack** setting, select **Docker** (it might already be selected).
5. Ensure the **Port** is set to `3002`.
6. Deploy! The `Dockerfile` uses Next.js Standalone mode for a highly optimized, lightweight Node.js production image.

## Option 2: Nixpacks
If you prefer not to use the Dockerfile, Coolify uses Nixpacks by default which works seamlessly with Next.js.
1. When setting up the Application in Coolify, select **Nixpacks** as the build pack.
2. Coolify will automatically detect it as a Next.js application, install dependencies, run `npm run build`, and start it.

*(Note: If you use Nixpacks, you might need to remove `output: "standalone"` from `next.config.mjs` depending on your preference, but it generally works fine either way).*
