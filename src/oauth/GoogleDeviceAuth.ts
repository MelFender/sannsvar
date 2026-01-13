/**
 * Google Device Code OAuth Flow
 *
 * Simpler OAuth flow that doesn't require client secret.
 * User gets a code, goes to google.com/device, enters code, and authorizes.
 * Similar to how YouTube TV apps authenticate.
 */

// Google Cloud SDK public client ID - works for device auth
// This is used by gcloud CLI and is known to work
const GOOGLE_SDK_CLIENT_ID = '764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com';
const GOOGLE_SDK_CLIENT_SECRET = 'd-FL95Q19q7MQmFpd7hHD0Ty'; // Public secret for SDK

const GOOGLE_DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// YouTube API scopes
const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'openid',
  'email',
  'profile',
].join(' ');

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * Request a device code for user authorization
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const response = await fetch(GOOGLE_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GOOGLE_SDK_CLIENT_ID,
      scope: YOUTUBE_SCOPES,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get device code: ${error}`);
  }

  return await response.json() as DeviceCodeResponse;
}

/**
 * Poll for authorization token after user enters the code
 */
export async function pollForToken(deviceCode: string): Promise<GoogleTokens | null> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GOOGLE_SDK_CLIENT_ID,
      client_secret: GOOGLE_SDK_CLIENT_SECRET,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  const data = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };

  // Still waiting for user to authorize
  if (data.error === 'authorization_pending') {
    return null;
  }

  // User denied or other error
  if (data.error) {
    throw new Error(`Authorization failed: ${data.error}`);
  }

  // Success - got tokens
  if (data.access_token) {
    const userInfo = await fetchUserInfo(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? '',
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
    };
  }

  return null;
}

/**
 * Refresh an expired access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GOOGLE_SDK_CLIENT_ID,
      client_secret: GOOGLE_SDK_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data = await response.json() as {
    access_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Fetch user info from Google
 */
async function fetchUserInfo(accessToken: string): Promise<{
  email?: string;
  name?: string;
  picture?: string;
}> {
  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return {};
    }

    return await response.json() as {
      email?: string;
      name?: string;
      picture?: string;
    };
  } catch {
    return {};
  }
}
