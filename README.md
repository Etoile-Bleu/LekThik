# LekThik

A collaborative task management tool inspired by Trello (boards, lists, cards), built to be tested in a multi-site deployment with [ZamSync](https://github.com/Etoile-Bleu/ZamSync), an offline-first replication engine.

Built as part of the Simulated Professional Work program.

## Stack

- **Frontend**: React
- **Backend**: Rust
- **Database**: PostgreSQL
- **Multi-site synchronization**: ZamSync
- **Public exposure**: Cloudflare Tunnel

## Project status

In development. Sprint 1: 2026-09-25.

## Running locally

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

This starts Postgres, runs migrations, and brings up the Rust API on
[http://localhost:8080](http://localhost:8080) and the React frontend on
[http://localhost:5173](http://localhost:5173) with hot reload. See
[backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for
service-specific commands.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the git workflow, commit conventions, and code standards. This project follows a [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT, see [LICENSE](LICENSE).

## Deployment

The `Deploy to VPS` workflow (Actions tab, Run workflow) builds the `main` branch, ships the images to the server and restarts the stack at https://lekthik.weier-corp.fr. Anyone with write access to the repository can run it.

It reads these secrets from the `production` environment, which only the `main` branch can use: `VPS_SSH_PRIVATE_KEY`, `VPS_SSH_HOST`, `VPS_SSH_USER`, `VPS_DEPLOY_DIR`, `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`. The application secrets (database password, JWT secret, SMTP) stay in the `.env` file of the deploy directory on the server, created once from `.env.example`, and are never stored in GitHub.
