# Admin Dashboard

The admin dashboard provides statistics and analytics for the URL shortener service.

## Access

The admin dashboard is accessible at `/admin` path.

## Authentication

The admin dashboard and stats API are protected with HTTP Basic Authentication.

> ⚠️ **SECURITY WARNING**: The default credentials are publicly known. You MUST change them immediately after deployment, especially for production environments.

**Default Credentials:**
- Username: `admin`
- Password: `admin123`

### Changing Credentials

You can customize the admin credentials by setting environment variables:

```bash
export ADMIN_USERNAME=your_username
export ADMIN_PASSWORD=your_password
```

Or in your `.env` file:
```
ADMIN_USERNAME=your_username
ADMIN_PASSWORD=your_password
```

## Features

The admin dashboard displays:

1. **Total URLs**: Total number of unique shortened URLs
2. **Last 24 Hours**: Number of URLs created in the last 24 hours
3. **Last 7 Days**: Number of URLs created in the last 7 days
4. **Storage Type**: Current storage backend (Redis, Vercel KV, or In-Memory)
5. **Recent URLs**: List of the 10 most recently created short URLs with:
   - Short ID
   - Original URL
   - Creation timestamp

## Auto-Refresh

The dashboard automatically refreshes every 30 seconds to show the latest statistics.

## API Endpoint

The statistics data is available via the `/api/stats` API endpoint, which also requires authentication.

Example request:
```bash
curl -u admin:admin123 http://localhost:3000/api/stats
```

Example response:
```json
{
  "success": true,
  "stats": {
    "totalUrls": 42,
    "urlsLast24Hours": 5,
    "urlsLast7Days": 15,
    "recentUrls": [
      {
        "shortId": "abc123",
        "originalUrl": "https://example.com",
        "createdAt": "2025-10-28T12:34:56.789Z"
      }
    ],
    "storageType": "redis",
    "timestamp": "2025-10-28T23:45:00.000Z"
  }
}
```

## Security Note

For production deployments, always change the default admin credentials to prevent unauthorized access to your statistics.
