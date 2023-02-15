import { TokenEndpointOptions, TokenEndpointResponse } from './global';
import { DEFAULT_AUTH0_CLIENT, DEFAULT_TOKEN_PATH } from './constants';
import { getJSON } from './http';
import { createQueryParams } from './utils';

interface Headers {
  [key: string]: string;
}

export async function oauthToken(
  {
    baseUrl,
    timeout,
    audience,
    scope,
    auth0Client,
    useFormData,
    disableAuth0Client,
    tokenPath = DEFAULT_TOKEN_PATH,
    ...options
  }: TokenEndpointOptions,
  worker?: Worker
) {
  const body = useFormData
    ? createQueryParams(options)
    : JSON.stringify(options);
  const headers: Headers = {
    'Content-Type': useFormData
      ? 'application/x-www-form-urlencoded'
      : 'application/json',
  };
  if (!disableAuth0Client) {
    headers['Auth0-Client'] = btoa(JSON.stringify(auth0Client || DEFAULT_AUTH0_CLIENT));
  }

  return await getJSON<TokenEndpointResponse>(
    `${baseUrl}/${tokenPath}`,
    timeout,
    audience || 'default',
    scope,
    {
      method: 'POST',
      body,
      headers
    },
    worker,
    useFormData
  );
}
