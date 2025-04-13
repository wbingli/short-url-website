# Running the Project with Docker

To run this project using Docker, follow the steps below:

## Prerequisites

- Ensure Docker and Docker Compose are installed on your system.
- Verify that the required environment variables are set. Create a `.env.local` file with the following content:

```env
KV_URL=your_kv_url_here
KV_REST_API_URL=your_kv_rest_api_url_here
KV_REST_API_TOKEN=your_kv_rest_api_token_here
```

## Build and Run

1. Build and start the services using Docker Compose:

```bash
docker-compose up --build
```

2. Access the application at [http://localhost:3000](http://localhost:3000).

## Services and Ports

- **App Service**: Exposes port `3000` for the application.
- **Redis Service**: Exposes port `6379` for the Redis database.

## Notes

- The `app` service is built using the provided `Dockerfile` and runs in production mode.
- The `redis` service uses the official Redis image and persists data in a Docker volume.

For further details, refer to the Docker Compose file and the `Dockerfile` provided in the project.