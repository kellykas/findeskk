# Findeskk

Prepare FinDesk as a modular, scalable and maintainable application that will be developed in multiple stages.

Important development requirements:

Organize the codebase into reusable components, modules, services and utilities.

Maintain a clear separation between frontend presentation, business logic and backend services.

Use TypeScript consistently.

Avoid unnecessary dependencies.

Keep the application compatible with continued development in external AI coding environments.

Ensure the project can be synchronized through GitHub.

Do not tightly couple financial calculations to UI components.

Prepare the application for a Supabase PostgreSQL backend.

Preserve existing architecture and functionality when new modules are introduced.

Document the project structure and important implementation decisions.

Do not attempt to implement every financial module at once. Establish the initial project foundation and prepare it for phased development.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://findeskk.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3c32da1e-d058-41a9-8139-28d805d6bf65).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Staff sign-in and administrator setup

Staff sign in at `/login`. Create the account in Supabase (Authentication → Users), then grant a role
with the SQL in [docs/ADMIN-SETUP.md](docs/ADMIN-SETUP.md). The first administrator can alternatively
use **Claim initial administrator** on the sign-in screen, which only works while no roles exist.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
